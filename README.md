# Infinity Castle Elements — INSANITY 4.1.1

## Requisitos

Para rodar o jogo corretamente, você precisa ter:

- **Node.js 18 ou superior** instalado no computador;
- **npm**, que normalmente já vem junto com o Node.js;
- um navegador atualizado, de preferência **Google Chrome**, **Microsoft Edge** ou **Firefox**;
- a porta **3000** livre no computador;
- conexão com a internet apenas na primeira execução, caso ainda seja necessário baixar as dependências com `npm install`.

## Como executar no Windows

A forma mais simples é abrir:

```
INICIAR_JOGO.bat
```

O arquivo verifica se o Node.js está instalado, instala as dependências automaticamente na primeira execução e inicia o servidor do jogo.

Depois, o jogo abre em:

```
http://localhost:3000
```

Para encerrar o servidor, volte para a janela do terminal e pressione:

```
CTRL + C
```

## Como executar manualmente

Abra um terminal dentro da pasta do projeto e rode:

```bash
npm install
npm start
```

Depois acesse no navegador:

```
http://localhost:3000
```

## Dependências utilizadas

O projeto utiliza:

- **Node.js**
- **Express**
- **Socket.IO**

As dependências do projeto já estão declaradas no arquivo `package.json` e são instaladas automaticamente pelo comando:

```bash
npm install
```

Não é necessário instalar Express ou Socket.IO separadamente.

## Se o jogo não abrir

Confira se:

- o Node.js está instalado com `node --version`;
- o npm está funcionando com `npm --version`;
- nenhuma outra aplicação está usando a porta 3000;
- as dependências foram instaladas corretamente;
- o terminal não exibiu nenhum erro ao iniciar o servidor.

Se necessário, execute novamente:

```bash
npm install
npm start
```
