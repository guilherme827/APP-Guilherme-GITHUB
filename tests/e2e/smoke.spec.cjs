const { test, expect } = require('@playwright/test');

test.describe('Smoke', () => {
    test('carrega a tela de login e permite alternar entre fluxos publicos', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

        await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
        await expect(page.getByRole('heading', { name: 'Recuperar senha' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Enviar recuperacao' })).toBeVisible();

        await page.getByRole('button', { name: 'Voltar' }).click();
        await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();

        await page.getByRole('button', { name: 'Solicite acesso a Geoconsult' }).click();
        await expect(page.getByRole('heading', { name: 'Solicitar acesso' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Enviar solicitacao' })).toBeVisible();
    });

    test('protege a rota da aplicacao sem sessao', async ({ page }) => {
        const response = await page.goto('/app');

        expect(response?.ok()).toBeTruthy();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByRole('heading', { name: 'Acesse sua conta' })).toBeVisible();
    });
});
