# Refract

**Refract** is an open-source CLI tool for **merging Prisma schemas** from multiple fragments and packages. It enables consistent schema management in monorepos, detects conflicts, generates cache for faster builds, and provides detailed schema statistics.

---

## 🔹 Features

* Merge `.prisma` files from **fragments** and **packages** automatically
* Detect conflicts in `model`, `enum`, `type`, and `view` blocks
* **Content hash-based caching** for incremental builds
* Strips `datasource` and `generator` blocks from package schemas automatically
* Generates detailed schema statistics
* Supports **custom paths** and forced rebuilds

---

## ⚡ Installation

Clone the repository:

```bash
git clone https://github.com/johanlabs/refract.git
cd refract
npm install
```

To install globally:

```bash
npm install -g .
```

---

## 🛠 Usage

Run the CLI with default paths:

```bash
refract
```

**Default paths**:

* Fragments: `./prisma/fragments`
* Packages: `./src/packages`
* Output: `./prisma/schema.prisma`

---

### CLI Options

| Option        | Alias | Type    | Description                   | Default                  |
| ------------- | ----- | ------- | ----------------------------- | ------------------------ |
| `--fragments` | `-f`  | string  | Path to fragments directory   | `./prisma/fragments`     |
| `--packages`  | `-p`  | string  | Path to packages schemas      | `./src/packages`         |
| `--output`    | `-o`  | string  | Output path for merged schema | `./prisma/schema.prisma` |
| `--force`     | -     | boolean | Force rebuild ignoring cache  | `false`                  |
| `--help`      | `-h`  | -       | Show CLI help                 | -                        |
| `--version`   | `-v`  | -       | Show CLI version              | -                        |

---

### Examples

Merge using default paths:

```bash
refract
```

Merge using custom paths:

```bash
refract -f ./custom/fragments -o ./output/schema.prisma
```

Force rebuild ignoring cache:

```bash
refract --force
```

---

## 🧩 How It Works

1. Scans all `.prisma` files in **fragments** and **packages** directories.
2. **Fragments** can contain `generator` and `datasource` blocks, which are preserved in the final schema.
3. **Package schemas** have `generator` and `datasource` blocks removed.
4. Each block (`model`, `enum`, `type`, `view`) is parsed and merged. Conflicts are logged.
5. Generates a **SHA-256 hash** of all files for caching.
6. Writes the merged schema to the **output path** and updates `.schema.cache`.

---

## 📊 Schema Statistics

After execution, Refract displays:

* Total `models`
* Total `enums`
* Total `types`
* Total `views`

This allows for quick verification of the merged schema structure.

---

## 💡 Best Practices

* Keep **fragments** for main schema definitions with `datasource` and `generator`.
* Package schemas should only contain additional models, enums, or types.
* Use `--force` if file changes are not reflected due to caching.

---

## 📜 License

Business Source License (BSL).