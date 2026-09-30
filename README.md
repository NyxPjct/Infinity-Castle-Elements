# Infinity Castle Elements 4.0

**Infinity Castle Elements** é um jogo original de plataforma troll para **1 ou 2 jogadores**, com **1000 fases**, quatro elementos jogáveis, inimigos, moedas, loja, boosts, cosméticos, 10 regiões do castelo e chefes a cada 100 fases.

A ideia continua sendo a essência de jogos como Cat Mario e Level Devil: o cenário mente, o chão cai, a saída foge e a armadilha aparece quando você acha que entendeu a fase — mas a sala precisa continuar fisicamente possível.

## Elementos jogáveis

- 🪨 **Terra** — resiste a raízes e usa Impacto Sísmico para destruir/atordoar ameaças próximas.
- 💨 **Ar** — mais rápido e leve, imune a vendavais e ganha Impulso Aéreo.
- ☀️ **Luz** — resiste a maldições e usa Clarão Protetor, além de atingir inimigos próximos.
- 🌑 **Escuridão** — ignora zonas de controle invertido e usa Passo Sombrio para atravessar perigos por um curto período.

## Singleplayer

Na tela inicial você escolhe **um único elemento** e joga toda a tentativa com ele. Não existe mais troca entre Terra e Ar.

Portões de pressão se adaptam ao solo: ao ativar a placa, o portão permanece destravado naquela tentativa. Nos chefes, o ritual pode ser realizado por um único elemento em qualquer uma das runas.

O progresso solo e o elemento utilizado ficam salvos no navegador.

## Multiplayer

Cada jogador escolhe seu próprio elemento antes de criar/entrar na sala. Os dois podem escolher elementos diferentes ou até repetir o mesmo elemento.

Nos chefes, cada jogador recebe uma das duas runas do ritual pelo slot da sala, independentemente do elemento escolhido.

## Moedas e Loja Arcana

A economia é salva localmente no navegador.

Você começa com moedas e pode ganhar mais:
- ao concluir fases;
- derrotando inimigos.

Depois de morrer, a Loja Arcana pode ser aberta antes da próxima tentativa.

Itens atuais:
- 🛡️ **Runa de Escudo** — absorve um golpe fatal na próxima tentativa;
- 🥾 **Botas do Vento** — aumenta a velocidade na próxima tentativa;
- 🪶 **Salto Arcano** — aumenta a força do salto na próxima tentativa;
- 👑 **Coroa do Castelo** — cosmético permanente;
- ✨ **Aura Elemental** — cosmético permanente.

## Inimigos

Além das armadilhas troll, as fases normais possuem inimigos procedurais, incluindo sentinelas, morcegos e espectros. A quantidade e variedade aumentam durante a campanha.

A geração protege spawn, saída, portões e placas para que os inimigos não transformem uma fase em uma sala estruturalmente impossível.

## Regiões

1. Portão e Pátio Real — 1–100
2. Galeria Nobre — 101–200
3. Masmorras Profundas — 201–300
4. Torre do Relógio — 301–400
5. Biblioteca Viva — 401–500
6. Capela Assombrada — 501–600
7. Jardins Suspensos — 601–700
8. Muralhas da Tempestade — 701–800
9. Trono Rubro — 801–900
10. Coração Impossível — 901–1000

Cada região tem background, arquitetura, iluminação, nomes de salas e mecânicas próprias.

## Controles

- **A/D** ou setas: mover
- **W / ↑ / Espaço**: pular
- **E**: habilidade elemental
- **R**: reiniciar a sala
- **⛶ Tela cheia**: fullscreen
- **Esc**: sair do fullscreen

## Auditoria das 1000 fases

Execute:

```bash
npm run test:levels
```

A build 4.0 foi auditada usando o próprio gerador do jogo:
- 1000 fases geradas;
- 1000 fases renderizadas;
- 10 chefes;
- 240 fases com portão;
- 12 arquétipos de layout;
- 10 regiões com 100 fases cada;
- 0 falhas na auditoria automatizada desta build.

## Executar

No Windows, abra `INICIAR_JOGO.bat`.

Ou:

```bash
npm install
npm start
```

Depois acesse `http://localhost:3000`.

## GitHub Actions

O workflow `.github/workflows/audit.yml` roda automaticamente a cada push ou Pull Request para `main`, verificando sintaxe e auditando as 1000 fases.

> O multiplayer usa Node.js + Socket.IO. GitHub Pages sozinho não executa o servidor online; para publicar o multiplayer é necessário um host com Node/WebSocket.
