import { PackageJson, Builder, Config } from './types';
import minimatch from 'minimatch';

interface ErrorResponse {
  code: string;
  message: string;
}

const src: string = 'package.json';
const config: Config = { zeroConfig: true };

// Static builders are special cased in `@now/static-build`
const BUILDERS = new Map<string, Builder>([
  ['next', { src, use: '@now/next', config }],
  ['nuxt', { src, use: '@now/nuxt', config }],
]);

const API_BUILDERS: Builder[] = [
  { src: 'api/**/*.js', use: '@now/node@canary', config },
  { src: 'api/**/*.ts', use: '@now/node@canary', config },
  { src: 'api/**/*.rs', use: '@now/rust', config },
  { src: 'api/**/*.go', use: '@now/go', config },
  { src: 'api/**/*.php', use: '@now/php', config },
  { src: 'api/**/*.py', use: '@now/python', config },
  { src: 'api/**/*.rb', use: '@now/ruby', config },
  { src: 'api/**/*.sh', use: '@now/bash', config },
];

const MISSING_BUILD_SCRIPT_ERROR: ErrorResponse = {
  code: 'missing_build_script',
  message:
    'Your `package.json` file is missing a `build` property inside the `script` property.' +
    '\nMore details: https://zeit.co/docs/v2/advanced/platform/frequently-asked-questions#missing-build-script',
};

function hasPublicDirectory(files: string[]) {
  return files.some(name => name.startsWith('public/'));
}

function hasBuildScript(pkg: PackageJson | undefined) {
  const { scripts = {} } = pkg || {};
  return Boolean(scripts && scripts['build']);
}

async function detectBuilder(pkg: PackageJson): Promise<Builder> {
  for (const [dependency, builder] of BUILDERS) {
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);

    // Return the builder when a dependency matches
    if (deps[dependency]) {
      return builder;
    }
  }

  // By default we'll choose the `static-build` builder
  return { src, use: '@now/static-build', config };
}

// Files that match a specific pattern will get ignored
export function ignoreApiFilter(file: string) {
  if (file.includes('/.')) {
    return false;
  }

  if (file.includes('/_')) {
    return false;
  }

  // If the file does not match any builder we also
  // don't want to create a route e.g. `package.json`
  if (API_BUILDERS.every(({ src }) => !minimatch(file, src))) {
    return false;
  }

  return true;
}

// We need to sort the file paths by alphabet to make
// sure the routes stay in the same order e.g. for deduping
export function sortFiles(fileA: string, fileB: string) {
  return fileA.localeCompare(fileB);
}

async function detectApiBuilders(files: string[]): Promise<Builder[]> {
  const builds = files
    .sort(sortFiles)
    .filter(ignoreApiFilter)
    .map(file => {
      const result = API_BUILDERS.find(
        ({ src }): boolean => minimatch(file, src)
      );

      return result ? { ...result, src: file } : null;
    });

  const finishedBuilds = builds.filter(Boolean);
  return finishedBuilds as Builder[];
}

// When zero config is used we can call this function
// to determine what builders to use
export async function detectBuilders(
  files: string[],
  pkg?: PackageJson | undefined | null
): Promise<{
  builders: Builder[] | null;
  errors: ErrorResponse[] | null;
}> {
  const errors: ErrorResponse[] = [];

  // Detect all builders for the `api` directory before anything else
  const builders = await detectApiBuilders(files);

  if (pkg && hasBuildScript(pkg)) {
    builders.push(await detectBuilder(pkg));
  } else {
    if (pkg && builders.length === 0) {
      // We only show this error when there are no api builders
      // since the dependencies of the pkg could be used for those
      errors.push(MISSING_BUILD_SCRIPT_ERROR);
      return { errors, builders: null };
    }

    // We allow a `public` directory
    // when there are no build steps
    if (hasPublicDirectory(files)) {
      builders.push({
        use: '@now/static',
        src: 'public/**/*',
        config,
      });
    } else if (builders.length > 0) {
      // We can't use pattern matching, since `!(api)` and `!(api)/**/*`
      // won't give the correct results
      builders.push(
        ...files
          .filter(name => !name.startsWith('api/'))
          .filter(name => !(name === 'package.json'))
          .map(name => ({
            use: '@now/static',
            src: name,
            config,
          }))
      );
    }
  }

  return {
    builders: builders.length ? builders : null,
    errors: errors.length ? errors : null,
  };
}
