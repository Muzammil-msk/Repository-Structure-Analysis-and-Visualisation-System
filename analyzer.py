from pathlib import Path
import ast
import re
import json
from radon.complexity import cc_visit
import traceback

IGNORED_DIRS = {
    "venv",
    ".venv",
    "__pycache__",
    ".git",
    "node_modules",
    "dist",
    "build"
}

SUPPORTED_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".ipynb"
}


def get_source_files(repo_path):

    files = []

    for file in Path(repo_path).rglob("*"):

        if not file.is_file():
            continue

        if file.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue

        if any(ignore in str(file) for ignore in IGNORED_DIRS):
            continue

        files.append(file)

    return files


def extract_imports(file_path):

    imports = []

    suffix = file_path.suffix.lower()

    try:

        with open(
            file_path,
            "r",
            encoding="utf-8",
            errors="ignore"
        ) as f:

            code = f.read()

        # Python
        if suffix == ".py":

            tree = ast.parse(code)

            for node in ast.walk(tree):

                if isinstance(node, ast.Import):

                    for name in node.names:
                        imports.append(name.name)

                elif isinstance(node, ast.ImportFrom):

                    if node.module:
                        imports.append(node.module)

        # JavaScript / TypeScript / React
        elif suffix in [".js", ".jsx", ".ts", ".tsx"]:

            imports.extend(
                re.findall(
                    r'import.*from\s+[\'"](.+?)[\'"]',
                    code
                )
            )

        # Java
        elif suffix == ".java":

            imports.extend(
                re.findall(
                    r'import\s+([\w\.]+)',
                    code
                )
            )

        # C / C++
        elif suffix in [".c", ".cpp", ".h", ".hpp"]:

            imports.extend(
                re.findall(
                    r'#include\s*[<"](.+?)[>"]',
                    code
                )
            )

        elif suffix == ".ipynb":

    

            notebook = json.loads(code)

            notebook_code = ""

            for cell in notebook.get("cells", []):

                if cell.get("cell_type") == "code":

                    notebook_code += "".join(
                        cell.get("source", [])
                 ) + "\n"

            imports.extend(
                re.findall(
                    r'import\s+([a-zA-Z0-9_\.]+)',
                    notebook_code
                )
            )

            imports.extend(
                re.findall(
                    r'from\s+([a-zA-Z0-9_\.]+)\s+import',
                    notebook_code
                )
            )

    except Exception as e:

            print("ERROR:")
            traceback.print_exc()

    return imports


def count_loc(file_path):

    try:

        if file_path.suffix == ".ipynb":

            with open(
                file_path,
                "r",
                encoding="utf-8"
            ) as f:

                notebook = json.load(f)

            loc = 0

            for cell in notebook.get("cells") or []:

                if cell.get("cell_type") == "code":

                    loc += len(
                        cell.get("source") or []
                    )

            return loc

        with open(
            file_path,
            "r",
            encoding="utf-8",
            errors="ignore"
        ) as f:

            return len(f.readlines())

    except:
        return 0


from radon.complexity import cc_visit


def get_complexity(file_path):

    try:

        with open(
            file_path,
            "r",
            encoding="utf-8",
            errors="ignore"
        ) as f:

            code = f.read()

        # Accurate complexity for Python
        if file_path.suffix == ".py":

            blocks = cc_visit(code)

            return sum(
                block.complexity
                for block in blocks
            )

        # Jupyter Notebook
        elif file_path.suffix == ".ipynb":

            import json

            notebook = json.loads(code)

            notebook_code = ""

            for cell in notebook.get("cells", []):

                if cell.get("cell_type") == "code":

                    notebook_code += "".join(
                        cell.get("source", [])
                    ) + "\n"

            keywords = [
                "if",
                "else",
                "elif",
                "for",
                "while",
                "try",
                "except",
                "and",
                "or"
            ]

            complexity = 1

            for keyword in keywords:

                complexity += notebook_code.count(keyword)

            return complexity

        # JS / TS / Java / C / C++
        else:

            keywords = [
                "if",
                "else",
                "elif",
                "for",
                "while",
                "switch",
                "case",
                "catch",
                "&&",
                "||",
                "?",
                "try"
            ]

            complexity = 1

            for keyword in keywords:

                complexity += code.count(keyword)

            return complexity

    except Exception as e:

        print(
            f"Complexity Error: {file_path}"
        )

        return 0


def analyze_repo(repo_path):

    nodes = []
    edges = []

    files = get_source_files(repo_path)

    file_lookup = {}

    for file in files:
        file_lookup[file.stem] = str(file)

    for file in files:

        nodes.append(
            {
                "id": str(file),
                "label": file.name,
                "loc": count_loc(file),
                "complexity": get_complexity(file),
                "language": file.suffix
            }
        )

        imports = extract_imports(file)

        for imp in imports:

            module_name = (
                imp.split("/")[-1]
                .split("\\")[-1]
                .split(".")[0]
            )

            if module_name in file_lookup:

                edges.append(
                    {
                        "source": str(file),
                        "target": file_lookup[module_name]
                    }
                )

    return {
        "nodes": nodes,
        "edges": edges
    }