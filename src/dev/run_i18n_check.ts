/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import chalk from 'chalk';
import Listr from 'listr';

import { createFailError, run } from '@osd/dev-utils';
import { ErrorReporter, I18nConfig } from './i18n';
import {
  extractDefaultMessages,
  extractUntrackedMessages,
  checkCompatibility,
  checkConfigs,
  mergeConfigs,
} from './i18n/tasks';

export interface ListrContext {
  config?: I18nConfig;
  reporter: ErrorReporter;
  messages: Map<string, { message: string }>;
}

const skipOnNoTranslations = (context: ListrContext) =>
  !context.config?.translations?.length && 'No translations found.';
run(
  async ({
    flags: {
      'ignore-incompatible': ignoreIncompatible,
      'ignore-malformed': ignoreMalformed,
      'ignore-missing': ignoreMissing,
      'ignore-unused': ignoreUnused,
      'include-config': includeConfig,
      'ignore-untracked': ignoreUntracked,
      fix = false,
      path,
    },
    log,
  }) => {
    if (
      fix &&
      (ignoreIncompatible !== undefined ||
        ignoreUnused !== undefined ||
        ignoreMalformed !== undefined ||
        ignoreMissing !== undefined ||
        ignoreUntracked !== undefined)
    ) {
      throw createFailError(
        `${chalk.white.bgRed(
          ' I18N ERROR '
        )} none of the --ignore-incompatible, --ignore-malformed, --ignore-unused or --ignore-missing,  --ignore-untracked is allowed when --fix is set.`
      );
    }

    if (typeof path === 'boolean' || typeof includeConfig === 'boolean') {
      throw createFailError(
        `${chalk.white.bgRed(' I18N ERROR ')} --path and --include-config require a value`
      );
    }

    if (typeof fix !== 'boolean') {
      throw createFailError(`${chalk.white.bgRed(' I18N ERROR ')} --fix can't have a value`);
    }

    const srcPaths = Array().concat(path || ['./src', './packages']);

    const list = new Listr<ListrContext>(
      [
        {
          title: 'Checking .i18nrc.json files',
          task: () => new Listr(checkConfigs(includeConfig), { exitOnError: true }),
        },
        {
          title: 'Merging .i18nrc.json files',
          task: () => new Listr(mergeConfigs(includeConfig), { exitOnError: true }),
        },
        {
          title: 'Checking For Untracked Messages based on .i18nrc.json',
          enabled: (_) => !ignoreUntracked,
          skip: skipOnNoTranslations,
          task: ({ config }) =>
            new Listr(extractUntrackedMessages(srcPaths), { exitOnError: true }),
        },
        {
          title: 'Validating Default Messages',
          skip: skipOnNoTranslations,
          task: ({ config }) => {
            return new Listr(extractDefaultMessages(config, srcPaths), { exitOnError: true });
          },
        },
        {
          title: 'Compatibility Checks',
          skip: skipOnNoTranslations,
          task: ({ config }) => {
            return new Listr<ListrContext>(
              checkCompatibility(
                config,
                {
                  ignoreMalformed: !!ignoreMalformed,
                  ignoreIncompatible: !!ignoreIncompatible,
                  ignoreUnused: !!ignoreUnused,
                  ignoreMissing: !!ignoreMissing,
                  fix,
                },
                log
              ),
              { exitOnError: true }
            );
          },
        },
      ],
      {
        concurrent: false,
        exitOnError: true,
      }
    );

    try {
      const reporter = new ErrorReporter();
      const messages: Map<string, { message: string }> = new Map();
      await list.run({ messages, reporter });
    } catch (error: ErrorReporter | Error) {
      process.exitCode = 1;
      if (error instanceof ErrorReporter) {
        error.errors.forEach((e: string | Error) => log.error(e));
      } else {
        log.error('Unhandled exception!');
        log.error(error);
      }
    }
  },
  {
    flags: {
      allowUnexpected: true,
      guessTypesForUnexpectedFlags: true,
    },
  }
);
