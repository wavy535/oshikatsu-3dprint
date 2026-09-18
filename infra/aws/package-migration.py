"""Package the IAM-only migration Lambda using installed pg dependencies."""
import json, pathlib, zipfile
root=pathlib.Path(__file__).resolve().parents[2]
output=pathlib.Path('/tmp/oshinest-migration.zip')
modules=set()
def collect(name):
 if name in modules:return
 modules.add(name)
 package=json.loads((root/'node_modules'/name/'package.json').read_text())
 for dependency in package.get('dependencies',{}):collect(dependency)
collect('pg')
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
 archive.write(root/'infra/aws/migrate.mjs','index.mjs')
 archive.write(root/'infra/aws/rds-global-bundle.pem','rds-global-bundle.pem')
 for path in (root/'db').rglob('*.sql'):
  if 'tests' not in path.parts:archive.write(path,path.relative_to(root))
 for name in sorted(modules):
  for path in (root/'node_modules'/name).rglob('*'):
   if path.is_file():archive.write(path,path.relative_to(root))
print(f'{output}: {output.stat().st_size} bytes; {len(modules)} pg modules')
