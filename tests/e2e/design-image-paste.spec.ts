import { expect, test } from '@playwright/test';

test('clipboard image attaches, respects the limit, preserves text paste and reaches the model request', async ({page, context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/create');
  await expect(page.getByTestId('design-status')).toHaveText('プレビューを更新しました');
  const input=page.getByLabel('変えたいところ',{exact:true});
  await input.fill('この画像から相談したい');
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ff0080';ctx.fillRect(0,0,32,32);
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!),'image/png'));
    await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
  });
  await input.focus();await input.press('ControlOrMeta+V');
  await expect(page.getByLabel('添付中の画像').getByRole('img')).toHaveCount(1);
  await expect(input).toHaveValue('この画像から相談したい');
  await expect(page.getByRole('button',{name:'送信して編集'})).toBeEnabled();
  await input.press('ControlOrMeta+V');
  await expect(page.getByLabel('添付中の画像').getByRole('img')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'送信して編集'})).toBeEnabled();
  await input.press('ControlOrMeta+V');
  await expect(page.getByRole('alert')).toHaveText('参考画像は2枚までです。');
  await expect(page.getByLabel('添付中の画像').getByRole('img')).toHaveCount(2);
  await page.getByRole('button',{name:'画像2を外す'}).click();
  await page.evaluate(()=>navigator.clipboard.writeText('追加の説明'));
  await input.focus();await input.press('ControlOrMeta+End');await input.press('ControlOrMeta+V');
  await expect(input).toHaveValue('この画像から相談したい追加の説明');
  await expect(page.getByLabel('添付中の画像').getByRole('img')).toHaveCount(1);
  let requests=0;
  await page.route('**/api/design/chat',async route=>{
    requests++;const body=route.request().postDataJSON();
    expect(body.images).toHaveLength(1);
    expect(body.images[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.message).toBe('この画像から相談したい追加の説明');
    await route.fulfill({json:{message:'画像を参考に相談できます。',changes:[],design:body.design,attempts:1}});
  });
  await page.getByRole('button',{name:'送信して編集'}).click();
  await expect(page.getByRole('log')).toContainText('画像を参考に相談できます。');
  expect(requests).toBe(1);
});
