const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const glob = require('glob');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

const log = (msg, color = 'reset') => {
  console.log(`${colors[color]}${msg}${colors.reset}`);
};

const hashFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
};

const parsePrismaSchema = (content, source) => {
  const schemaParts = {};
  const blockRegex = /(model|enum|type|view)\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match;

  while ((match = blockRegex.exec(content)) !== null) {
    const [_, kind, name, body] = match;
    const blockKey = `${kind}:${name}`;
    schemaParts[blockKey] = {
      kind,
      name,
      body: body.trim(),
      source,
    };
  }

  return schemaParts;
};

const mergeSchemas = (baseSchema, newSchema) => {
  for (const [key, newBlock] of Object.entries(newSchema)) {
    if (!baseSchema[key]) {
      baseSchema[key] = newBlock;
    } else {
      const existing = baseSchema[key];
      if (existing.body === newBlock.body) {
        log(`  "${newBlock.name}" (${newBlock.kind}) already exists`, 'gray');
      } else {
        log(`  ⚠️  Conflict in "${newBlock.name}" (${newBlock.kind})`, 'yellow');
        log(`      From: ${existing.source} ⟷ ${newBlock.source}`, 'yellow');
      }
    }
  }
  return baseSchema;
};

const schemaToString = (schema) => {
  return Object.values(schema)
    .map(({ kind, name, body, source }) => {
      const comment = `// @source: ${source}`;
      const indent = (text, spaces = 2) => text
        .split('\n')
        .map(line => line.trim() ? ' '.repeat(spaces) + line.trim() : '')
        .join('\n');

      return `${comment}\n${kind} ${name} {\n${indent(body)}\n}`;
    })
    .join('\n\n');
};

const removeDataSourceAndGenerator = (content) => {
  return content.replace(/(datasource|generator)\s+\w+\s+\{[\s\S]*?\}/g, '');
};

const showStats = (schema) => {
  const stats = { model: 0, enum: 0, type: 0, view: 0 };
  Object.values(schema).forEach(({ kind }) => {
    stats[kind] = (stats[kind] || 0) + 1;
  });
  
  log('\n📊 Schema Statistics:', 'cyan');
  Object.entries(stats).forEach(([kind, count]) => {
    if (count > 0) log(`   ${kind}s: ${count}`, 'gray');
  });
};

const createSchemas = (options) => {
  const cwd = path.resolve(process.cwd());
  const fragmentsDir = path.resolve(cwd, options.fragments);
  const packagesDir = path.resolve(cwd, options.packages);
  const outputPath = path.resolve(cwd, options.output);
  const outputDir = path.dirname(outputPath);
  const cacheFile = path.join(outputDir, '.schema.cache');

  try {
    log('\n🔍 Scanning for .prisma files...', 'cyan');
    log(`   Fragments: ${path.relative(cwd, fragmentsDir)}`, 'blue');
    log(`   Packages:  ${path.relative(cwd, packagesDir)}`, 'blue');
    log(`   Output:    ${path.relative(cwd, outputPath)}`, 'blue');

    if (!fs.existsSync(fragmentsDir)) {
      throw new Error(`Directory "${options.fragments}" not found.`);
    }

    const fragmentPattern = path.join(fragmentsDir, '*.prisma').replace(/\\/g, '/');
    const packagePattern = path.join(packagesDir, '**/*.prisma').replace(/\\/g, '/');

    const fragmentFiles = glob.sync(fragmentPattern);
    const schemaFiles = glob.sync(packagePattern);

    log(`\n   Found ${fragmentFiles.length} fragment(s)`, 'gray');
    log(`   Found ${schemaFiles.length} package schema(s)`, 'gray');

    if (fragmentFiles.length === 0 && schemaFiles.length === 0) {
      throw new Error('No .prisma files found');
    }

    const allFiles = [...fragmentFiles, ...schemaFiles];
    const combinedHash = allFiles.map(hashFile).join('');
    const finalHash = crypto.createHash('sha256').update(combinedHash).digest('hex');

    if (!options.force && fs.existsSync(cacheFile)) {
      const cachedHash = fs.readFileSync(cacheFile, 'utf-8');
      if (cachedHash === finalHash) {
        log('\n⚙️  No changes detected — using cached schema.', 'gray');
        log(`   Cache: ${path.relative(cwd, cacheFile)}\n`, 'gray');
        return;
      }
    }

    log('\n🔨 Merging schemas...', 'cyan');
    let finalSchema = {};

    fragmentFiles.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const relative = path.relative(cwd, file);
      const parsed = parsePrismaSchema(content, relative);
      finalSchema = mergeSchemas(finalSchema, parsed);
    });

    schemaFiles.forEach((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      const cleaned = removeDataSourceAndGenerator(content);
      const relative = path.relative(cwd, file);
      const parsed = parsePrismaSchema(cleaned, relative);
      finalSchema = mergeSchemas(finalSchema, parsed);
    });

    const baseSchemaPath = path.join(fragmentsDir, 'schema.prisma');
    let baseSchemaContent = '';
    if (fs.existsSync(baseSchemaPath)) {
      baseSchemaContent = fs.readFileSync(baseSchemaPath, 'utf-8').trim();
    }

    const finalContent = `${baseSchemaContent}\n\n${schemaToString(finalSchema)}\n`;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, finalContent, 'utf-8');
    fs.writeFileSync(cacheFile, finalHash, 'utf-8');

    showStats(finalSchema);
    log('\n✅ Schema successfully merged!', 'green');
    log(`   Output: ${path.relative(cwd, outputPath)}`, 'gray');
    log(`   Cache:  ${path.relative(cwd, cacheFile)}\n`, 'gray');
  } catch (error) {
    log(`\n❌ Error: ${error.message}\n`, 'red');
    process.exit(1);
  }
};

const argv = yargs(hideBin(process.argv))
  .scriptName('refract')
  .usage('$0 [options]')
  .option('fragments', {
    alias: 'f',
    type: 'string',
    description: 'Path to fragments directory',
    default: './prisma/fragments',
  })
  .option('packages', {
    alias: 'p',
    type: 'string',
    description: 'Path to packages schemas',
    default: './src/packages',
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Output path for merged schema',
    default: './prisma/schema.prisma',
  })
  .option('force', {
    type: 'boolean',
    description: 'Force rebuild (ignore cache)',
    default: false,
  })
  .example('$0', 'Merge with default paths')
  .example('$0 -f ./custom/fragments -o ./output/schema.prisma', 'Custom paths')
  .example('$0 --force', 'Force rebuild ignoring cache')
  .help()
  .alias('help', 'h')
  .version()
  .alias('version', 'v')
  .argv;

createSchemas(argv);
