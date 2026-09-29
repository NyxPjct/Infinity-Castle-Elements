# Terra & Ar — Castelo Infinito 3.3: Devil Mode — Auditoria das 1000 Fases

Jogo original de plataforma troll para **1 ou 2 jogadores**, com **1000 fases**, singleplayer controlando Terra e Ar, multiplayer por sala privada, 10 regiões do castelo, chefes a cada 100 fases e modo tela cheia.

A versão **3.3** foi feita para atacar bugs estruturais de fase: o castelo pode ser cruel, mentiroso e cheio de pegadinhas, mas a fase precisa continuar tendo uma solução física possível.

## O que foi corrigido na 3.3

- auditoria automatizada das **1000 fases**, usando o próprio `game.js`;
- teste de geração e renderização de todas as 1000 salas;
- validação de rota física usando os limites de salto de **Terra**, que é o personagem menos móvel;
- validação das 240 fases com portão cooperativo;
- proteção de spawn, saída, placas e áreas críticas contra sobreposição de armadilhas;
- plataformas estreitas mantêm uma zona real de aterrissagem;
- correção das fases de chefe: as runas agora são alcançáveis por Terra e existe uma rota superior para atravessar os chefes avançados sem uma parede contínua de espinhos;
- sincronização de função Terra/Ar no multiplayer após desconexão;
- mortes simultâneas no multiplayer não contam duas vezes;
- ritual dos chefes no multiplayer passou a ser validado pelo servidor, evitando divergência entre os dois clientes;
- o servidor bloqueia a saída do chefe enquanto o ritual não tiver sido concluído;
- cada placa agora acende individualmente quando realmente está pressionada.

## Resultado da auditoria desta build

- **1000/1000 fases geradas**;
- **1000/1000 fases renderizadas** sem exceção no teste automatizado;
- **10 chefes** encontrados;
- **240 fases com portão cooperativo** verificadas;
- **12 arquétipos de layout** presentes;
- **100 fases em cada uma das 10 regiões**;
- **0 falhas** nas regras estruturais verificadas pela auditoria 3.3.

Você pode repetir a auditoria com:

```bash
npm run test:levels
```

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

## Controles

- A/D ou setas: mover
- W / seta para cima / espaço: pular
- E: habilidade
- Q / Tab: trocar Terra/Ar no singleplayer
- F: segurar posição no singleplayer
- R: reiniciar
- botão **⛶ Tela cheia**: fullscreen; `Esc` sai

## Executar

No Windows, abra `INICIAR_JOGO.bat`. Ou:

```bash
npm install
npm start
```

Depois acesse `http://localhost:3000`.

## Observação

A auditoria reduz fortemente a chance de fases estruturalmente impossíveis e corrige os bugs detectados nesta revisão. Como qualquer jogo procedural, ainda pode existir algum comportamento de navegador, rede ou combinação de timing que não apareça em teste automatizado; por isso o script de auditoria foi incluído no projeto para facilitar novas verificações.

## CI no GitHub

O repositório inclui o workflow `.github/workflows/audit.yml`. A cada `push` ou Pull Request para `main`, o GitHub Actions:

1. instala as dependências;
2. verifica a sintaxe do JavaScript;
3. executa `npm run test:levels`;
4. audita as 1000 fases antes de considerar a build válida.

> Este projeto usa Node.js + Socket.IO para o multiplayer, então **GitHub Pages sozinho não hospeda o modo online**. Para publicar o multiplayer, use um host Node/WebSocket (por exemplo Render, Railway, Fly.io ou VPS).
