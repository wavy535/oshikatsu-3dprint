import { chromium, expect } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
const browser = await chromium.launch({headless:true});
const results=[];
try {
  for (const dir of process.argv.slice(2)) {
    for (const file of (await readdir(dir)).filter(f=>f.endsWith('.oshinest.json'))) {
      const page = await browser.newPage({viewport:{width:1440,height:1100}});
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://localhost:3000/create');
      await expect(page.getByTestId('design-status')).toHaveText('プレビューを更新しました');
      await page.getByText('設計を開く・ファイルに保存',{exact:true}).click();
      await page.getByLabel('設計ファイル',{exact:true}).setInputFiles(`${dir}/${file}`);
      const design=JSON.parse(await readFile(`${dir}/${file}`,'utf8'));
      await expect(page.getByLabel('部品一覧').getByRole('button',{name:design.programs[0].name})).toBeVisible();
      await expect(page.getByTestId('design-status')).toHaveText('プレビューを更新しました');
      await page.getByRole('button',{name:'視点を戻す'}).click();
      await page.locator('canvas').screenshot({path:`${dir}/${file.replace('.oshinest.json','.png')}`});
      const canvasBox=await page.locator('canvas').boundingBox();
      if(canvasBox){
        const x=canvasBox.x+canvasBox.width/2,y=canvasBox.y+canvasBox.height/2;
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+canvasBox.height*0.17,{steps:12});await page.mouse.up();
        await page.locator('canvas').screenshot({path:`${dir}/${file.replace('.oshinest.json','-top.png')}`});
      }
      const download=page.waitForEvent('download');
      await page.getByRole('button',{name:'印刷用3MFを保存'}).click();
      const files=unzipSync(await readFile(await (await download).path()));
      expect(JSON.parse(strFromU8(files['design.oshinest.json']))).toEqual(design);
      expect(errors).toEqual([]);
      results.push({file:`${dir}/${file}`,passed:true,browserExportMatches:true,errors});
      await page.close();
    }
    await writeFile(`${dir}/browser-checks.json`,JSON.stringify(results.filter(r=>r.file.startsWith(dir+'/')),null,2));
  }
} finally {await browser.close();}
console.log(JSON.stringify(results));
