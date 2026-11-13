import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function walk(dir) { return readdirSync(dir, {withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
const files=['core','server','web/js','tests','scripts'].flatMap(d=>walk(path.join(root,d))).filter(f=>/\.(js|mjs)$/.test(f));
for (const f of files) {
 const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});
 if(r.status!==0){console.error(r.stderr||r.error);process.exit(1);}
}
const html=readFileSync(path.join(root,'web/index.html'),'utf8');
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
 if(/^(data:|https?:)/.test(m[1]))continue;
 if(!existsSync(path.join(root,'web',m[1]))){console.error('Missing asset:',m[1]);process.exit(1);}
}
console.log(`Проверены синтаксис ${files.length} файлов и ссылки на ресурсы index.html. Сборка не требуется.`);
