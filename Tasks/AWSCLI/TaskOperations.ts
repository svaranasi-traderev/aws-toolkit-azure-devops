/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import * as tl from 'azure-pipelines-task-lib/task'
import * as tr from 'azure-pipelines-task-lib/toolrunner'
import { getCredentials, getRegion } from 'Common/awsConnectionParameters'
import { SdkUtils } from 'Common/sdkutils'
import { TaskParameters } from './TaskParameters'

export class TaskOperations {
    public constructor(public readonly taskParameters: TaskParameters) {}

    public async execute(): Promise<void> {
        this.checkIfAwsCliIsInstalled()
        await this.configureAwsCli()
        await SdkUtils.configureHttpProxyFromAgentProxyConfiguration('AWSCLI')

        const awsCliPath = tl.which('aws')
        const awsCliTool: tr.ToolRunner = tl.tool(awsCliPath)
        awsCliTool.arg(this.taskParameters.awsCliCommand)
        awsCliTool.arg(this.taskParameters.awsCliSubCommand)
        if (this.taskParameters.awsCliParameters) {
            awsCliTool.line(this.taskParameters.awsCliParameters)
        }
        // tslint:disable-next-line: no-unsafe-any
        const code: number = await awsCliTool.exec({ failOnStdErr: this.taskParameters.failOnStandardError } as any)
        tl.debug(`return code: ${code}`)
        if (code !== 0) {
            throw new Error(tl.loc('AwsReturnCode', awsCliTool, code))
        }
        tl.setResult(tl.TaskResult.Succeeded, tl.loc('AwsReturnCode', awsCliTool, code))
    }

    // If assume role credentials are in play, make sure the initial generation
    // of temporary credentials has been performed. If no credentials and/or
    // region were defined then we assume they are already set in the host
    // environment. Environment variables are preferred over stored profiles
    // as this isolates parallel builds and avoids content left lying around on
    // the agent when a build completes
    private async configureAwsCli() {
        const env = process.env

        const connectionParams = this.taskParameters.awsConnectionParameters
        const credentials = await getCredentials(connectionParams)
        if (credentials) {
            await credentials.getPromise()
            tl.debug('configure credentials into environment variables')
            env.AWS_ACCESS_KEY_ID = credentials.accessKeyId
            env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey
            if (connectionParams.AssumeRoleARN) {
                env.AWS_ROLE_ARN = connectionParams.AssumeRoleARN
            }
            if (credentials.sessionToken) {
                env.AWS_SESSION_TOKEN = credentials.sessionToken
            }
        }

        const region = await getRegion()
        if (region) {
            tl.debug('configure region into environment variable')
            env.AWS_DEFAULT_REGION = region
        }
    }

    private checkIfAwsCliIsInstalled(): boolean {
        try {
            return !!tl.which('aws', true)
        } catch (error) {
            throw new Error(`${tl.loc('AWSCLINotInstalled')}\n${error}`)
        }
    }
}
