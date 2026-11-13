import {expect,test} from '@playwright/test';

test('预设策划可进入工作台，并在同页完成固定方案模拟',async({page})=>{
 await page.goto('/#home');
 await page.getByRole('button',{name:/新生迎新活动.*用这个预设/}).click();
 await expect(page.getByText('先确认一下你的活动')).toBeVisible();
 await page.getByRole('button',{name:'生成活动方案'}).click();
 await expect(page.getByRole('navigation',{name:'活动主流程'})).toBeVisible();
 await page.getByRole('button',{name:/模拟与执行/}).click();
 await expect(page.getByText('查看或调整模型参数')).toBeVisible();
 await expect(page.getByRole('textbox',{name:'随机种子'})).toBeHidden();
 await page.getByRole('checkbox',{name:/我已核对人员/}).check();
 await page.getByRole('button',{name:'快速模拟并查看结果'}).click();
 await expect(page.getByText('快速模拟已在本页完成', {exact:false})).toBeVisible();
 await expect(page.getByRole('heading',{name:/实验复盘/})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('button',{name:/模拟与执行/})).toHaveAttribute('aria-current','step');
});

test('首页输入 Shift+Enter 换行而不提交',async({page})=>{
 await page.goto('/#home');
 const idea=page.getByRole('textbox',{name:'描述你的活动想法'});
 await idea.fill('校园讲座');
 await idea.press('Shift+Enter');
 await expect(idea).toHaveValue('校园讲座\n');
 await expect(page.getByRole('button',{name:'AI 帮我策划'})).toBeEnabled();
});
