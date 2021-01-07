import { pathExists, unlink } from '@ionic/utils-fs';
import { basename, dirname, resolve } from 'path';

import c from '../colors';
import { check, checkAppId, checkAppName, runTask } from '../common';
import {
  CONFIG_FILE_NAME_JSON,
  CONFIG_FILE_NAME_TS,
  writeConfig,
} from '../config';
import { getCordovaPreferences } from '../cordova';
import type { Config, ExternalConfig } from '../definitions';
import { fatal, isFatal } from '../errors';
import { output, logSuccess, logPrompt } from '../log';
import { resolveNode } from '../util/node';
import { checkInteractive, isInteractive } from '../util/term';

export async function initCommand(
  config: Config,
  name: string,
  id: string,
  webDirFromCLI?: string,
): Promise<void> {
  try {
    if (!checkInteractive(name, id)) {
      return;
    }

    if (config.app.extConfigType !== 'json') {
      fatal(
        `Cannot run ${c.input(
          'init',
        )} for a project using a non-JSON configuration file.\n` +
          `Delete ${c.strong(config.app.extConfigName)} and try again.`,
      );
    }

    const isNewConfig = Object.keys(config.app.extConfig).length === 0;
    const tsInstalled = !!resolveNode(config.app.rootDir, 'typescript');
    const appName = await getName(config, name);
    const appId = await getAppId(config, id);
    const webDir = isInteractive()
      ? await getWebDir(config, webDirFromCLI)
      : webDirFromCLI ?? config.app.extConfig.webDir ?? 'www';

    await check([
      () => checkAppName(config, appName),
      () => checkAppId(config, appId),
    ]);

    const cordova = await getCordovaPreferences(config);

    await runMergeConfig(
      config,
      {
        appId,
        appName,
        webDir,
        bundledWebRuntime: false,
        cordova,
      },
      isNewConfig && tsInstalled ? 'ts' : 'json',
    );
  } catch (e) {
    output.write(
      'Usage: npx cap init appName appId\n' +
        'Example: npx cap init "My App" "com.example.myapp"\n\n',
    );

    if (!isFatal(e)) {
      fatal(e.stack ?? e);
    }

    throw e;
  }
}

async function getName(config: Config, name: string) {
  if (!name) {
    const answers = await logPrompt(
      `${c.strong(`What is the name of your app?`)}\n` +
        `This should be a human-friendly app name, like what you'd see in the App Store.`,
      {
        type: 'text',
        name: 'name',
        message: `Name`,
        initial: config.app.appName
          ? config.app.appName
          : config.app.package.name ?? 'App',
      },
    );
    return answers.name;
  }
  return name;
}

async function getAppId(config: Config, id: string) {
  if (!id) {
    const answers = await logPrompt(
      `${c.strong(`What should be the Package ID for your app?`)}\n` +
        `Package IDs (aka Bundle ID in iOS and Application ID in Android) are unique identifiers for apps. They must be in reverse domain name notation, generally representing a domain name that you or your company owns.`,
      {
        type: 'text',
        name: 'id',
        message: `Package ID`,
        initial: config.app.appId ? config.app.appId : 'com.example.app',
      },
    );
    return answers.id;
  }
  return id;
}

async function getWebDir(config: Config, webDir?: string) {
  if (!webDir) {
    const answers = await logPrompt(
      `${c.strong(`What is the web asset directory for your app?`)}\n` +
        `This directory should contain the final ${c.strong(
          'index.html',
        )} of your app.`,
      {
        type: 'text',
        name: 'webDir',
        message: `Web asset directory`,
        initial: config.app.webDir ? config.app.webDir : 'www',
      },
    );
    return answers.webDir;
  }
  return webDir;
}

async function runMergeConfig(
  config: Config,
  extConfig: ExternalConfig,
  type: 'json' | 'ts',
) {
  const configDirectory = dirname(config.app.extConfigFilePath);
  const newConfigPath = resolve(
    configDirectory,
    type === 'ts' ? CONFIG_FILE_NAME_TS : CONFIG_FILE_NAME_JSON,
  );

  await runTask(
    `Creating ${c.strong(basename(newConfigPath))} in ${c.input(
      config.app.rootDir,
    )}`,
    async () => {
      await mergeConfig(config, extConfig, newConfigPath);
    },
  );

  if (
    newConfigPath !== config.app.extConfigFilePath &&
    (await pathExists(config.app.extConfigFilePath))
  ) {
    const answers = await logPrompt(
      `${c.strong(`Remove old ${config.app.extConfigName} file?`)}\n` +
        `The path to your configuration file changed. Would you like to delete the old configuration file?`,
      {
        type: 'confirm',
        name: 'confirm',
        message: `Delete ${c.strong(config.app.extConfigName)}?`,
        initial: true,
      },
    );

    if (answers.confirm) {
      await unlink(config.app.extConfigFilePath);
    }
  }

  printNextSteps(basename(newConfigPath));
}

async function mergeConfig(
  config: Config,
  extConfig: ExternalConfig,
  newConfigPath: string,
): Promise<void> {
  const oldConfig = { ...config.app.extConfig };
  const newConfig = { ...oldConfig, ...extConfig };

  await writeConfig(newConfig, newConfigPath);
}

function printNextSteps(newConfigName: string) {
  logSuccess(`${c.strong(newConfigName)} created!`);
  output.write(
    `\nAdd platforms using ${c.input('npx cap add')}:\n` +
      `  ${c.input('npx cap add android')}\n` +
      `  ${c.input('npx cap add ios')}\n\n` +
      `Follow the Developer Workflow guide to get building:\n${c.strong(
        `https://capacitorjs.com/docs/v3/basics/workflow`,
      )}\n`,
  );
}
