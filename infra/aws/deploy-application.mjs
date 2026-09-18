// Deploy to the explicitly selected account; no credentials are written to disk.
// Run only after the foundation stack is complete and the image has been pushed.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const profile = process.env.OSHINEST_AWS_PROFILE;
const region = process.env.OSHINEST_AWS_REGION;
const account = process.env.OSHINEST_AWS_ACCOUNT;
const operation = process.argv[2];
if (!profile || !region || !account || !['migration', 'application', 'update', 'configure-url'].includes(operation))
  throw new Error('Set OSHINEST_AWS_PROFILE/REGION/ACCOUNT and choose migration, application, update or configure-url');
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--profile', profile, '--region', region, '--output', 'json'], { encoding: 'utf8' }) || '{}');
if (aws('sts', 'get-caller-identity').Account !== account) throw new Error('Unexpected AWS account');
const foundation = aws('cloudformation', 'describe-stacks', '--stack-name', 'oshinest-demo-foundation').Stacks[0];
if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(foundation.StackStatus)) throw new Error('Foundation is not ready');
const outputs = Object.fromEntries(foundation.Outputs.map(o => [o.OutputKey, o.OutputValue]));
if (operation === 'migration') {
  const config = {
    FunctionName: 'oshinest-demo-migrate', Runtime: 'nodejs24.x', Handler: 'index.handler',
    Role: outputs.MigrationRoleArn, Timeout: 600, MemorySize: 512,
    VpcConfig: { SubnetIds: [outputs.SubnetA, outputs.SubnetB], SecurityGroupIds: [outputs.AppSecurityGroup], Ipv6AllowedForDualStack: true },
    Environment: { Variables: { DATABASE_HOST: outputs.DatabaseEndpoint, MASTER_SECRET_ARN: outputs.MasterSecretArn, RUNTIME_PASSWORD_ARN: outputs.RuntimePasswordArn } },
  };
  const file = '/tmp/oshinest-migration-config.json';
  writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
  const result = aws('lambda', 'create-function', '--cli-input-json', `file://${file}`, '--zip-file', 'fileb:///tmp/oshinest-migration.zip');
  console.log(JSON.stringify({ function: result.FunctionName, state: result.State }));
} else if (operation === 'application' || operation === 'update') {
  const image = process.env.OSHINEST_IMAGE_URI;
  if (!image?.startsWith(`${outputs.RepositoryUri}@sha256:`)) throw new Error('Set OSHINEST_IMAGE_URI to the repository image digest');
  const keys = ['AppRoleArn','SubnetA','SubnetB','AppSecurityGroup','DatabaseEndpoint','RuntimePasswordArn','AuthSecretArn','Bucket'];
  const parameters = [...keys.map(key => ({ ParameterKey: key, ParameterValue: outputs[key] })), { ParameterKey: 'ImageUri', ParameterValue: image }];
  const file = '/tmp/oshinest-app-parameters.json';
  writeFileSync(file, JSON.stringify(parameters), { mode: 0o600 });
  if (operation === 'update') {
    const stack = aws('cloudformation', 'describe-stacks', '--stack-name', 'oshinest-demo-app').Stacks[0];
    if (!['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus)) throw new Error('Application is not ready');
    const updates = stack.Parameters.map(p => p.ParameterKey === 'ImageUri'
      ? { ParameterKey: 'ImageUri', ParameterValue: image }
      : { ParameterKey: p.ParameterKey, UsePreviousValue: true });
    writeFileSync(file, JSON.stringify(updates), { mode: 0o600 });
    aws('cloudformation', 'update-stack', '--stack-name', 'oshinest-demo-app', '--template-body', 'file://infra/aws/application.json', '--parameters', `file://${file}`);
    aws('cloudformation', 'wait', 'stack-update-complete', '--stack-name', 'oshinest-demo-app');
    console.log(JSON.stringify({ stack: 'oshinest-demo-app', status: 'UPDATE_COMPLETE' }));
  } else {
    console.log(aws('cloudformation','create-stack','--stack-name','oshinest-demo-app','--template-body','file://infra/aws/application.json','--parameters',`file://${file}`,'--tags','Key=Project,Value=OshiNest','Key=Environment,Value=guest-demo'));
  }
} else {
  const stack = aws('cloudformation','describe-stacks','--stack-name','oshinest-demo-app').Stacks[0];
  if (!['CREATE_COMPLETE','UPDATE_COMPLETE'].includes(stack.StackStatus)) throw new Error('Application is not ready');
  const url = stack.Outputs.find(o => o.OutputKey === 'Url').OutputValue.replace(/\/$/, '');
  const parameters = stack.Parameters.map(p => p.ParameterKey === 'SiteUrl' ? { ParameterKey: 'SiteUrl', ParameterValue: url } : { ParameterKey: p.ParameterKey, UsePreviousValue: true });
  const file = '/tmp/oshinest-url-parameters.json';
  writeFileSync(file, JSON.stringify(parameters), { mode: 0o600 });
  aws('cloudformation','update-stack','--stack-name','oshinest-demo-app','--use-previous-template','--parameters',`file://${file}`);
  aws('cloudformation','update-stack','--stack-name','oshinest-demo-foundation','--template-body','file://infra/aws/foundation.json','--capabilities','CAPABILITY_IAM','--parameters',`ParameterKey=SiteUrl,ParameterValue=${url}`);
  console.log(JSON.stringify({ url }));
}
