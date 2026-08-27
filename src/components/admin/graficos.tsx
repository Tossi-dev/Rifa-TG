"use client";

/* =========================================================================
 *  Gráficos do painel, em SVG puro.
 *
 *  Sem biblioteca de gráfico de propósito: são cinco formas simples, e uma
 *  dependência de ~200 KB para desenhá-las custaria mais no carregamento do
 *  que o painel inteiro pesa hoje. Em troca, cada regra de leitura fica
 *  explícita aqui — eixo de barra ancorado no zero, rótulo direto seletivo,
 *  legenda sempre que houver duas séries, e nenhuma cor escrita à mão.
 *
 *  Toda cor vem dos tokens de `globals.css`, e por isso os dois temas
 *  funcionam sem uma única linha condicional neste arquivo. As quatro séries
 *  identificam CATEGORIA; verde, âmbar e vermelho ficam reservados para
 *  ESTADO.
 * ========================================================================= */

import { useCallback, useEffect, useId, useRef, useState } from "react";

/* ------------------------------------------------------ Medida do card -- */

/**
 * Largura real do container, em pixels.
 *
 * Necessária porque um SVG que escala por `viewBox` encolhe o texto junto:
 * um rótulo de 11px viraria 7px no celular. Medindo, o desenho se adapta e a
 * tipografia continua no tamanho certo.
 */
function useLargura(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [largura, setLargura] = useState<number>(0);

  useEffect(() => {
    const alvo = ref.current;
    if (!alvo) return;
    const observador = new ResizeObserver((entradas) => {
      const medida = entradas[0]?.contentRect.width ?? 0;
      setLargura(Math.round(medida));
    });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return [ref, largura];
}

/* --------------------------------------------------------- Utilitários -- */

const ALTURA = 252;
/* `esquerda` é o piso: a margem real é recalculada a partir do maior rótulo
   já formatado (ver `margemEsquerda`). Com "R$ 12,5 mil" na escala, 52px
   fixos cortavam o "R" pela metade na borda do SVG. */
const MARGEM = { topo: 24, direita: 16, baixo: 34, esquerda: 56 };

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (v: number) => v.toLocaleString("pt-BR");

/**
 * Eixo de dinheiro. A unidade sai só na marca do topo.
 *
 * "R$" repetido nas cinco marcas é tinta redundante — e é justamente o que
 * obriga a coluna da esquerda a ser larga. Uma vez no topo basta para o eixo
 * inteiro se declarar dinheiro.
 */
const dinheiroCurto = (v: number, comUnidade = false): string => {
  const n =
    v >= 1000
      ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
      : numero(v);
  return comUnidade ? `R$ ${n}` : n;
};

const contagem = (v: number, comUnidade = false): string => {
  void comUnidade;
  return numero(Math.round(v));
};

type Formatador = (valor: number, comUnidade: boolean) => string;

/**
 * Escada do eixo Y com números redondos, sempre começando no zero.
 *
 * Dividir o máximo por 4 dá marcas como 138 / 104 / 69 / 35, que ninguém lê.
 * Aqui o passo é arredondado para 1, 2, 2,5 ou 5 vezes uma potência de dez —
 * é o que faz o eixo virar 150 / 100 / 50 / 0.
 */
export function escalaY(maximo: number): { topo: number; marcas: number[] } {
  if (!Number.isFinite(maximo) || maximo <= 0) return { topo: 1, marcas: [0, 1] };

  const bruto = maximo / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].find((m) => m * potencia >= bruto) ?? 10;
  const escolhido = passo * potencia;

  /* O laço só para DEPOIS de passar do máximo. Parar antes — que é o que
     acontece com uma tolerância de meio passo — deixa o topo abaixo do maior
     valor, e a barra sai desenhada para fora da área do gráfico: cortada pelo
     `overflow-hidden` do cartão, sem rótulo, e com o comprimento mentindo. */
  const marcas: number[] = [];
  for (let v = 0; ; v += escolhido) {
    marcas.push(Number(v.toFixed(6)));
    if (v >= maximo || marcas.length > 14) break;
  }
  return { topo: marcas[marcas.length - 1], marcas };
}

/**
 * Margem esquerda suficiente para o maior rótulo do eixo.
 *
 * Sem isto a coluna é fixa em 52px e o texto é clipado pela borda do SVG —
 * "R$ 12,5 mil" a 11px mede ~60px e o "R" sai fatiado ao meio. Texto cortado
 * na moldura é o sinal número um de que a tela foi programada, não desenhada.
 * 6,1px por caractere é a média medida da stack de sistema em 11px.
 */
export function margemEsquerda(marcas: number[], formatar: Formatador): number {
  const topo = marcas[marcas.length - 1];
  const maior = marcas.reduce(
    (maximo, valor) =>
      Math.max(maximo, formatar(valor, valor === topo).length),
    0
  );
  return Math.max(MARGEM.esquerda, Math.round(maior * 6.1) + 16);
}

/**
 * Definições de degradê. Uma por SVG; o `id` precisa ser único no DOM.
 *
 * ATENÇÃO: `currentColor` dentro de um `<stop>` NÃO resolve pela forma que usa
 * o degradê — resolve pela propriedade `color` herdada pelo próprio `<stop>`,
 * que vem do `<svg>`. Por isso a cor da série é declarada no elemento `<svg>`,
 * e não num `<g>` interno. Com a cor no `<g>`, o degradê caía no `--foreground`
 * da página: no tema escuro as barras saíam brancas e a área, cinza.
 */
function DefsGrafico({ id }: { id: string }) {
  return (
    <defs>
      {/* Área: vertical, do topo do desenho até a linha do zero.
          `userSpaceOnUse` de propósito — com `objectBoundingBox` o degradê se
          comprimiria nos dias fracos e a área ficaria mais escura justamente
          quando o dado é menor. Mentira ótica. */}
      <linearGradient
        id={`${id}-area`}
        gradientUnits="userSpaceOnUse"
        x1={0}
        y1={MARGEM.topo}
        x2={0}
        y2={ALTURA - MARGEM.baixo}
      >
        <stop
          offset="0%"
          stopColor="currentColor"
          style={{ stopOpacity: "var(--grafico-area-topo)" }}
        />
        <stop
          offset="55%"
          stopColor="currentColor"
          style={{ stopOpacity: "var(--grafico-area-meio)" }}
        />
        <stop
          offset="100%"
          stopColor="currentColor"
          style={{ stopOpacity: "var(--grafico-area-base)" }}
        />
      </linearGradient>

      {/* Barra: `objectBoundingBox` de propósito, para toda barra receber a
          mesma rampa relativa — senão a mais alta ficaria proporcionalmente
          mais clara que a mais baixa. Os dois extremos são OPACOS: só a
          luminosidade varia. Barra que desbota na base embaralha onde é o
          zero, e o zero é a âncora da leitura. */}
      <linearGradient id={`${id}-barra`} x1="0" y1="0" x2="0" y2="1">
        <stop
          offset="0%"
          stopColor="color-mix(in oklab, currentColor 88%, var(--grafico-realce))"
        />
        <stop offset="100%" stopColor="currentColor" />
      </linearGradient>
    </defs>
  );
}

/**
 * Polilinha suavizada (Catmull-Rom → Bézier cúbica), com trava de amplitude.
 *
 * A TRAVA é o ponto inegociável. Catmull-Rom solto ultrapassa: entre um dia
 * de 40 cotas e um de 300, a alça de controle empurra a curva para além de
 * 300 e o gráfico passa a afirmar um pico que nunca existiu — num acumulado,
 * chega a desenhar descida entre dois valores crescentes. Como uma Bézier
 * vive dentro do fecho convexo dos seus pontos de controle, grampear os
 * controles ao intervalo [p1, p2] garante, por construção, que a curva jamais
 * saia do intervalo dos dois valores REAIS que ela liga.
 */
export function caminhoSuave(
  pontos: Array<{ x: number; y: number }>,
  tensao = 0.2
): string {
  if (pontos.length === 0) return "";
  if (pontos.length === 1) return `M ${pontos[0].x} ${pontos[0].y}`;

  const travar = (v: number, a: number, b: number) =>
    Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

  let d = `M ${pontos[0].x} ${pontos[0].y}`;
  for (let i = 0; i < pontos.length - 1; i++) {
    const p0 = pontos[i - 1] ?? pontos[i];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[i + 2] ?? p2;

    const c1x = travar(p1.x + (p2.x - p0.x) * tensao, p1.x, p2.x);
    const c1y = travar(p1.y + (p2.y - p0.y) * tensao, p1.y, p2.y);
    const c2x = travar(p2.x - (p3.x - p1.x) * tensao, p1.x, p2.x);
    const c2y = travar(p2.y - (p3.y - p1.y) * tensao, p1.y, p2.y);

    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Retângulo com o topo arredondado e a base reta.
 *
 * `rx` no `<rect>` arredonda os quatro cantos, e o canto inferior arredondado
 * descola a barra da linha do zero — a âncora vira sugestão. Aqui a base
 * continua reta, encostada no eixo.
 */
export function caminhoBarra(
  x: number,
  y: number,
  largura: number,
  altura: number
): string {
  const r = Math.min(3, largura / 4, Math.max(0, altura));
  if (altura <= r) return `M ${x} ${y} h ${largura} v ${altura} h ${-largura} Z`;
  return [
    `M ${x} ${y + r}`,
    `a ${r} ${r} 0 0 1 ${r} ${-r}`,
    `h ${largura - 2 * r}`,
    `a ${r} ${r} 0 0 1 ${r} ${r}`,
    `v ${altura - r}`,
    `h ${-largura}`,
    "Z",
  ].join(" ");
}

/** Atraso de entrada escalonado, com teto de 160 ms no último item. */
const atraso = (indice: number, total: number): string =>
  `${Math.min(20, 160 / Math.max(total, 1)) * indice}ms`;

function Grade({
  largura,
  esquerda,
  maximo,
  formatar,
}: {
  largura: number;
  esquerda: number;
  maximo: number;
  formatar: Formatador;
}) {
  const { marcas } = escalaY(maximo);
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;
  const topo = marcas[marcas.length - 1];

  return (
    <g aria-hidden>
      {marcas.map((valor) => {
        /* O meio pixel não é frescura: uma hairline de 1px centrada em
           coordenada inteira cobre metade de duas fileiras de pixel, e o
           navegador a espalha em dois cinzas de 50%. É a causa física da
           sensação de grade suja em tela comum. */
        const y =
          Math.round(MARGEM.topo + alturaUtil * (1 - valor / (maximo || 1))) +
          0.5;
        const ehZero = valor === 0;
        return (
          <g key={valor}>
            <line
              x1={esquerda}
              x2={largura - MARGEM.direita}
              y1={y}
              y2={y}
              /* A linha do zero é a âncora do comprimento das barras: se ela
                 tem o mesmo peso das auxiliares, o olho perde onde apoiar a
                 comparação. Token próprio, ~2,5× mais firme. */
              stroke={ehZero ? "var(--grafico-base)" : "var(--grafico-grade)"}
              strokeWidth={1}
            />
            <text
              x={esquerda - 10}
              y={y + 3.5}
              textAnchor="end"
              fontSize={11}
              fontWeight={500}
              style={{ fontVariantNumeric: "tabular-nums" }}
              fill="var(--grafico-eixo)"
            >
              {formatar(valor, valor === topo)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Linha de referência (meta, ritmo necessário): tracejada porque não é dado. */
function Referencia({
  esquerda,
  largura,
  y,
  texto,
}: {
  esquerda: number;
  largura: number;
  y: number;
  texto: string;
}) {
  return (
    <g aria-hidden>
      <line
        x1={esquerda}
        x2={largura - MARGEM.direita}
        y1={y}
        y2={y}
        stroke="var(--grafico-eixo)"
        strokeWidth={1.25}
        strokeDasharray="5 4"
        opacity={0.75}
      />
      <text
        x={largura - MARGEM.direita}
        y={y - 7}
        textAnchor="end"
        fontSize={10}
        fontWeight={600}
        style={{ letterSpacing: "0.02em" }}
        fill="var(--grafico-eixo)"
      >
        {texto}
      </text>
    </g>
  );
}

/** Rótulo do eixo x nas duas pontas. */
function Extremos({
  esquerda,
  largura,
  primeiro,
  ultimo,
}: {
  esquerda: number;
  largura: number;
  primeiro?: string;
  ultimo?: string;
}) {
  return (
    <g aria-hidden>
      <text
        x={esquerda}
        y={ALTURA - 12}
        fontSize={11}
        fontWeight={500}
        fill="var(--grafico-eixo)"
      >
        {primeiro}
      </text>
      {ultimo && ultimo !== primeiro && (
        <text
          x={largura - MARGEM.direita}
          y={ALTURA - 12}
          textAnchor="end"
          fontSize={11}
          fontWeight={500}
          fill="var(--grafico-eixo)"
        >
          {ultimo}
        </text>
      )}
    </g>
  );
}

/**
 * Balão de leitura, em duas linhas.
 *
 * Segue o ponto nos DOIS eixos. Preso no topo do container, como estava, ele
 * podia aparecer a 200px de distância do que descreve, e o olho tinha que
 * fazer a ligação sozinho. Também não anima posição: um balão que desliza
 * atrás do cursor obriga a esperar para ler.
 */
function Balao({
  x,
  y,
  largura,
  rotulo,
  valor,
}: {
  x: number;
  y: number;
  largura: number;
  rotulo: string;
  valor: string;
}) {
  const alinharDireita = x > largura / 2;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-md shadow-black/5 dark:shadow-black/40"
      style={{
        top: Math.max(MARGEM.topo - 6, y - 54),
        ...(alinharDireita
          ? { right: Math.max(0, largura - x) + 10 }
          : { left: x + 10 }),
      }}
    >
      <p className="text-[11px] leading-none whitespace-nowrap text-muted-foreground">
        {rotulo}
      </p>
      <p className="mt-1 text-[13px] leading-none font-semibold tabular-nums whitespace-nowrap text-popover-foreground">
        {valor}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Moldura -- */

export function Moldura({
  titulo,
  descricao,
  legenda,
  children,
  vazio,
}: {
  titulo: string;
  descricao?: string;
  legenda?: Array<{ cor: string; rotulo: string; tracejada?: boolean }>;
  children: (largura: number) => React.ReactNode;
  vazio?: string;
}) {
  const [ref, largura] = useLargura();

  return (
    /* `min-w-0` não é enfeite: sem ele o item de grade assume largura mínima
       automática e um filho largo (o SVG) estica a coluna, estourando a tela
       no celular em vez de encolher para caber.
       `flex-col` + `flex-1` no corpo: os cards de uma linha da grade têm a
       mesma altura, e sem isto sobrava uma poça de branco no rodapé do card
       mais curto enquanto o vizinho estava cheio. */
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">
        {titulo}
      </h3>
      {descricao && (
        <p className="mt-1 text-xs leading-[1.45] text-muted-foreground">
          {descricao}
        </p>
      )}

      {legenda && legenda.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {legenda.map((item) => (
            <li
              key={item.rotulo}
              className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
            >
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded-full"
                style={{
                  backgroundColor: item.tracejada ? "transparent" : item.cor,
                  borderTop: item.tracejada
                    ? `2px dashed ${item.cor}`
                    : undefined,
                }}
              />
              {item.rotulo}
            </li>
          ))}
        </ul>
      )}

      <div
        ref={ref}
        className="mt-4 flex flex-1 items-center"
        style={{ minHeight: ALTURA }}
      >
        {/* `largura > 0` governa os DOIS ramos: antes o texto de vazio
            renderizava sem medida e o card mudava de altura no primeiro
            `ResizeObserver`. */}
        {largura > 0 &&
          (vazio ? (
            <Vazio largura={largura} mensagem={vazio} />
          ) : (
            children(largura)
          ))}
      </div>
    </section>
  );
}

/**
 * Card sem dado.
 *
 * A laje cinza de antes lia como "quebrado" e era 40px mais baixa que um card
 * cheio — a linha da grade pulava quando a primeira venda entrava. Aqui fica
 * a moldura do gráfico futuro: mesma altura, mesma cadência de grade, sem
 * número inventado e sem esqueleto pulsante (pulsar significa "carregando", e
 * isto não é carregar — é não ter acontecido).
 */
function Vazio({ largura, mensagem }: { largura: number; mensagem: string }) {
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;
  return (
    <div className="relative w-full">
      <svg width={largura} height={ALTURA} aria-hidden>
        {[0, 1, 2, 3, 4].map((k) => {
          const y = Math.round(MARGEM.topo + (alturaUtil / 4) * k) + 0.5;
          return (
            <line
              key={k}
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={y}
              y2={y}
              stroke={k === 4 ? "var(--grafico-base)" : "var(--grafico-grade)"}
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] leading-relaxed text-muted-foreground">
        {mensagem}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- Área ---- */

export function GraficoArea({
  largura,
  pontos: recebidos,
  meta,
}: {
  largura: number;
  pontos: Array<{ rotulo: string; acumulado: number }>;
  meta: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");

  /* Com um único dia de venda, uma polilinha de um ponto não desenha nada e o
     cartão fica só com a grade. Duplicar o ponto vira uma faixa reta do
     tamanho do gráfico — que é a leitura honesta de "um dia, este valor". */
  const pontos =
    recebidos.length === 1 ? [recebidos[0], recebidos[0]] : recebidos;

  /* Os 8% de folga existem para a linha da meta não cair EXATAMENTE em cima
     da marca superior da grade: duas coisas de significado diferente no mesmo
     pixel, no ponto de maior destaque do painel. */
  const maximo = escalaY(
    Math.max(meta, ...pontos.map((p) => p.acumulado), 1) * 1.08
  ).topo;
  const { marcas } = escalaY(maximo);
  const esquerda = margemEsquerda(marcas, dinheiroCurto);

  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;
  const larguraUtil = largura - esquerda - MARGEM.direita;
  const passo = pontos.length > 1 ? larguraUtil / (pontos.length - 1) : 0;

  const x = (i: number) => esquerda + passo * i;
  const y = (v: number) => MARGEM.topo + alturaUtil * (1 - v / maximo);

  const coords = pontos.map((p, i) => ({ x: x(i), y: y(p.acumulado) }));
  const dLinha = caminhoSuave(coords, 0.2);
  const dArea = `${dLinha} L ${x(pontos.length - 1)} ${y(0)} L ${esquerda} ${y(0)} Z`;
  const ultimo = pontos[pontos.length - 1];

  /* Eventos de ponteiro, não de mouse: o mesmo código atende dedo, caneta e
     cursor. Com `onMouseMove` o gráfico simplesmente não respondia no
     celular, que é onde ele mais é aberto. */
  const aoMover = useCallback(
    (evento: React.PointerEvent<SVGSVGElement>) => {
      const caixa = evento.currentTarget.getBoundingClientRect();
      const posicao = evento.clientX - caixa.left - esquerda;
      const i = passo > 0 ? Math.round(posicao / passo) : 0;
      setAtivo(i >= 0 && i < pontos.length ? i : null);
    },
    [passo, pontos.length, esquerda]
  );

  return (
    <div className="relative w-full">
      <svg
        width={largura}
        height={ALTURA}
        role="img"
        aria-label="Arrecadação acumulada por dia"
        style={{ touchAction: "pan-y", color: "var(--serie-1)" }}
        onPointerMove={aoMover}
        onPointerLeave={() => setAtivo(null)}
        onPointerCancel={() => setAtivo(null)}
      >
        <DefsGrafico id={id} />
        <Grade
          largura={largura}
          esquerda={esquerda}
          maximo={maximo}
          formatar={dinheiroCurto}
        />

        {ativo !== null && (
          <line
            x1={x(ativo)}
            x2={x(ativo)}
            y1={MARGEM.topo}
            y2={ALTURA - MARGEM.baixo}
            stroke="var(--grafico-guia)"
            strokeWidth={1}
            aria-hidden
          />
        )}

        <g>
          <path d={dArea} className="g-surge" fill={`url(#${id}-area)`} />
          <path
            d={dLinha}
            pathLength={1}
            className="g-traco"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {ativo !== null ? (
            <circle
              cx={x(ativo)}
              cy={y(pontos[ativo].acumulado)}
              r={4.5}
              fill="currentColor"
              stroke="var(--card)"
              strokeWidth={2}
            />
          ) : (
            ultimo && (
              <circle
                className="g-rotulo"
                cx={x(pontos.length - 1)}
                cy={y(ultimo.acumulado)}
                r={4}
                fill="currentColor"
                stroke="var(--card)"
                strokeWidth={2}
              />
            )
          )}
        </g>

        <Referencia
          esquerda={esquerda}
          largura={largura}
          y={y(meta)}
          texto={`meta ${brl(meta)}`}
        />

        <Extremos
          esquerda={esquerda}
          largura={largura}
          primeiro={pontos[0]?.rotulo}
          ultimo={pontos.length > 1 ? ultimo?.rotulo : undefined}
        />
      </svg>

      {ativo !== null && (
        <Balao
          largura={largura}
          x={x(ativo)}
          y={y(pontos[ativo].acumulado)}
          rotulo={pontos[ativo].rotulo}
          valor={brl(pontos[ativo].acumulado)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Linha ---- */

export function GraficoLinha({
  largura,
  pontos: recebidos,
  necessario,
}: {
  largura: number;
  pontos: Array<{ rotulo: string; cotas: number }>;
  necessario: number;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");

  // Mesmo motivo do gráfico de área: um ponto só não desenha linha nenhuma.
  const pontos =
    recebidos.length === 1 ? [recebidos[0], recebidos[0]] : recebidos;

  const maximo = escalaY(
    Math.max(necessario, ...pontos.map((p) => p.cotas), 1) * 1.1
  ).topo;
  const { marcas } = escalaY(maximo);
  const esquerda = margemEsquerda(marcas, contagem);

  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;
  const larguraUtil = largura - esquerda - MARGEM.direita;
  const passo = pontos.length > 1 ? larguraUtil / (pontos.length - 1) : 0;

  const x = (i: number) => esquerda + passo * i;
  const y = (v: number) => MARGEM.topo + alturaUtil * (1 - v / maximo);

  /* Tensão menor que a do acumulado: esta série é serrilhada por natureza, e
     quanto mais ruidoso o dado menos suavização — senão a curva deixa de
     mostrar e passa a interpretar. */
  const dLinha = caminhoSuave(
    pontos.map((p, i) => ({ x: x(i), y: y(p.cotas) })),
    0.14
  );

  const aoMover = useCallback(
    (evento: React.PointerEvent<SVGSVGElement>) => {
      const caixa = evento.currentTarget.getBoundingClientRect();
      const posicao = evento.clientX - caixa.left - esquerda;
      const i = passo > 0 ? Math.round(posicao / passo) : 0;
      setAtivo(i >= 0 && i < pontos.length ? i : null);
    },
    [passo, pontos.length, esquerda]
  );

  /* Vinte marcadores idênticos numa linha de 2px viram colar de contas. Acima
     de sete pontos ficam só as pontas e o que estiver sob o cursor. */
  const mostrarTodos = pontos.length <= 7;

  return (
    <div className="relative w-full">
      <svg
        width={largura}
        height={ALTURA}
        role="img"
        aria-label="Cotas vendidas por dia comparadas ao ritmo necessário"
        style={{ touchAction: "pan-y", color: "var(--serie-1)" }}
        onPointerMove={aoMover}
        onPointerLeave={() => setAtivo(null)}
        onPointerCancel={() => setAtivo(null)}
      >
        <DefsGrafico id={id} />
        <Grade
          largura={largura}
          esquerda={esquerda}
          maximo={maximo}
          formatar={contagem}
        />

        {ativo !== null && (
          <line
            x1={x(ativo)}
            x2={x(ativo)}
            y1={MARGEM.topo}
            y2={ALTURA - MARGEM.baixo}
            stroke="var(--grafico-guia)"
            strokeWidth={1}
            aria-hidden
          />
        )}

        {necessario > 0 && (
          <Referencia
            esquerda={esquerda}
            largura={largura}
            y={y(necessario)}
            texto={`necessário ${numero(necessario)}/dia`}
          />
        )}

        <g>
          <path
            d={dLinha}
            pathLength={1}
            className="g-traco"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {pontos.map((p, i) => {
            const ponta = i === 0 || i === pontos.length - 1;
            if (!mostrarTodos && !ponta && ativo !== i) return null;
            return (
              <circle
                key={`${i}-${p.rotulo}`}
                className="g-rotulo"
                cx={x(i)}
                cy={y(p.cotas)}
                r={ativo === i ? 5 : 3.5}
                fill="currentColor"
                stroke="var(--card)"
                strokeWidth={2}
                style={{ transition: "r 140ms ease-out" }}
              />
            );
          })}
        </g>

        <Extremos
          esquerda={esquerda}
          largura={largura}
          primeiro={pontos[0]?.rotulo}
          ultimo={
            pontos.length > 1 ? pontos[pontos.length - 1]?.rotulo : undefined
          }
        />
      </svg>

      {ativo !== null && (
        <Balao
          largura={largura}
          x={x(ativo)}
          y={y(pontos[ativo].cotas)}
          rotulo={pontos[ativo].rotulo}
          valor={`${numero(pontos[ativo].cotas)} ${
            pontos[ativo].cotas === 1 ? "cota" : "cotas"
          }`}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Barra ---- */

export function GraficoBarra({
  largura,
  itens,
  sufixo,
  rotulo,
  rotularTodas = true,
}: {
  largura: number;
  itens: Array<{ rotulo: string; valor: number }>;
  sufixo: string;
  /** Descrição para leitor de tela. Obrigatória: dois gráficos de barra na
   *  mesma página com o mesmo rótulo fazem o leitor anunciar a mesma frase
   *  duas vezes, e quem não vê a tela não tem como saber qual é qual. */
  rotulo: string;
  rotularTodas?: boolean;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");

  // Barra comunica por comprimento: o eixo SEMPRE começa no zero.
  const maximo = escalaY(Math.max(...itens.map((i) => i.valor), 1)).topo;
  const { marcas } = escalaY(maximo);
  const esquerda = margemEsquerda(marcas, contagem);

  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.baixo;
  const larguraUtil = largura - esquerda - MARGEM.direita;
  const faixa = larguraUtil / Math.max(itens.length, 1);
  /* Teto de 56px: com quatro categorias numa coluna larga, a barra chegava a
     110px e virava parede de tijolo — a área passava a dominar a leitura e o
     comprimento, que é o canal do dado, sumia. */
  const larguraBarra = Math.max(3, Math.min(56, faixa - 4));

  const maiorIndice = itens.reduce(
    (melhor, item, i) => (item.valor > itens[melhor].valor ? i : melhor),
    0
  );

  return (
    <div className="relative w-full">
      <svg
        width={largura}
        height={ALTURA}
        role="img"
        aria-label={rotulo}
        style={{ touchAction: "pan-y", color: "var(--serie-1)" }}
        onPointerLeave={() => setAtivo(null)}
        onPointerCancel={() => setAtivo(null)}
      >
        <DefsGrafico id={id} />
        <Grade
          largura={largura}
          esquerda={esquerda}
          maximo={maximo}
          formatar={contagem}
        />

        <g>
          {itens.map((item, i) => {
            const altura = (item.valor / maximo) * alturaUtil;
            const centro = esquerda + faixa * i + faixa / 2;
            const x = centro - larguraBarra / 2;
            const y = MARGEM.topo + alturaUtil - altura;
            const mostrarRotulo =
              rotularTodas || i === maiorIndice || ativo === i;
            return (
              <g
                key={`${i}-${item.rotulo}`}
                onPointerEnter={() => setAtivo(i)}
                onPointerDown={() => setAtivo(i)}
              >
                {/* Alvo de toque na largura da FAIXA, não da barra: com 24
                    barras o alvo ficaria menor que um dedo. */}
                <rect
                  x={esquerda + faixa * i}
                  y={MARGEM.topo}
                  width={faixa}
                  height={alturaUtil}
                  fill="transparent"
                />
                <path
                  className="g-cresce-y"
                  style={{
                    animationDelay: atraso(i, itens.length),
                    transition: "opacity 150ms ease-out",
                  }}
                  d={caminhoBarra(
                    x,
                    y,
                    larguraBarra,
                    Math.max(altura, item.valor > 0 ? 2 : 0)
                  )}
                  fill={`url(#${id}-barra)`}
                  opacity={
                    ativo === null || ativo === i
                      ? 1
                      : "var(--grafico-esmaecido)"
                  }
                />
                {mostrarRotulo && item.valor > 0 && (
                  <text
                    className="g-rotulo"
                    x={centro}
                    y={y - 7}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                    fill="var(--foreground)"
                  >
                    {numero(item.valor)}
                  </text>
                )}
                <text
                  x={centro}
                  y={ALTURA - 12}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={500}
                  fill="var(--grafico-eixo)"
                >
                  {item.rotulo}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {ativo !== null && (
        <Balao
          largura={largura}
          x={esquerda + faixa * ativo + faixa / 2}
          y={
            MARGEM.topo +
            alturaUtil -
            (itens[ativo].valor / maximo) * alturaUtil
          }
          rotulo={itens[ativo].rotulo}
          valor={`${numero(itens[ativo].valor)} ${sufixo}`}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------- Barra horizontal ---- */

export function GraficoHorizontal({
  largura,
  itens,
}: {
  largura: number;
  itens: Array<{ rotulo: string; valor: number; detalhe: string }>;
}) {
  const maximo = Math.max(...itens.map((i) => i.valor), 1);
  const rotuloLargura = Math.min(130, Math.max(78, largura * 0.26));
  /* Reserva fixa para o número e o valor: sem ela o trilho come o espaço e
     "R$ 750,00" sai cortado como "R…". */
  const reserva = 118;
  const posicaoLargura = 20;
  const trilho = Math.max(
    24,
    largura - rotuloLargura - reserva - posicaoLargura
  );

  /* `<ol>` porque a ordem É o dado, e a coluna de posição a torna explícita:
     num top-10 a classificação existia só implicitamente na sequência das
     linhas. E o líder NÃO é recolorido — recolorir codificaria posição com
     cor, e na semana seguinte a cor trocaria de pessoa. O destaque sai por
     três canais que não são cor: número de posição, fundo da linha e peso. */
  return (
    <ol className="w-full space-y-0.5" style={{ color: "var(--serie-1)" }}>
      {itens.map((item, i) => (
        <li
          key={`${i}-${item.rotulo}`}
          className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-[13px] ${
            i === 0 ? "bg-secondary" : ""
          }`}
        >
          <span
            className="shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground"
            style={{ width: posicaoLargura }}
            aria-hidden
          >
            {i + 1}.
          </span>

          <span
            className="shrink-0 truncate font-medium text-foreground"
            style={{ width: rotuloLargura }}
            title={item.rotulo}
          >
            {item.rotulo}
          </span>

          {/* O trilho é a régua: sem ele o décimo colocado é um tracinho solto
              e não há como ver o quanto ele está longe do primeiro. */}
          <span
            className="h-2.5 shrink-0 overflow-hidden rounded-[4px]"
            style={{ width: trilho, backgroundColor: "var(--grafico-trilho)" }}
            aria-hidden
          >
            <span
              className="g-cresce-x block h-full rounded-[4px]"
              style={{
                width: `${Math.max(2.5, (item.valor / maximo) * 100)}%`,
                animationDelay: atraso(i, itens.length),
                backgroundImage:
                  "linear-gradient(90deg, currentColor 0%, color-mix(in oklab, currentColor 86%, var(--grafico-realce)) 100%)",
              }}
            />
          </span>

          <span
            className={`ml-auto shrink-0 tabular-nums text-foreground ${
              i === 0 ? "font-bold" : "font-semibold"
            }`}
          >
            {numero(item.valor)}
          </span>
          <span className="w-[74px] shrink-0 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
            {item.detalhe}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------- Rosca ---- */

const COR_ESTADO: Record<string, string> = {
  pago: "var(--estado-bom)",
  aguardando: "var(--serie-1)",
  vencido: "var(--estado-neutro)",
  devolver: "var(--estado-ruim)",
};

export function GraficoRosca({
  largura,
  fatias,
}: {
  largura: number;
  fatias: Array<{ rotulo: string; valor: number; estado: string }>;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (total <= 0) return null;

  const tamanho = Math.min(largura, 208);
  const raio = tamanho / 2 - 4;
  const espessura = 20;
  const raioMedio = raio - espessura / 2;
  const centro = tamanho / 2;

  const pagas = fatias.find((f) => f.estado === "pago")?.valor ?? 0;
  const percentualPago = (pagas / total) * 100;

  const folga = fatias.length > 1 ? 2 / raioMedio : 0;
  /* `strokeLinecap="round"` ACRESCENTA meia espessura de comprimento em cada
     ponta: sem descontar, uma fatia de 5% renderiza como 8% e a rosca mente.
     O desconto é exatamente esse meio-traço convertido em ângulo. */
  const capAng = espessura / 2 / raioMedio;

  const arcos = fatias.map((f, indice) => {
    const anteriores = fatias
      .slice(0, indice)
      .reduce((soma, outra) => soma + outra.valor, 0);
    const inicio = -Math.PI / 2 + (anteriores / total) * Math.PI * 2;
    const extensao = (f.valor / total) * Math.PI * 2;

    // A ponta redonda só cabe se sobrar arco depois de descontá-la dos lados.
    const redonda = extensao > 2 * capAng + folga + 0.02;
    const recuo = folga / 2 + (redonda ? capAng : 0);

    const a1 = inicio + recuo;
    const a2 = inicio + extensao - recuo;
    const p = (ang: number) => [
      centro + Math.cos(ang) * raioMedio,
      centro + Math.sin(ang) * raioMedio,
    ];
    const [x1, y1] = p(a1);
    const [x2, y2] = p(a2);
    const grande = a2 - a1 > Math.PI ? 1 : 0;

    return {
      ...f,
      redonda,
      visivel: a2 > a1,
      d: `M ${x1} ${y1} A ${raioMedio} ${raioMedio} 0 ${grande} 1 ${x2} ${y2}`,
    };
  });

  return (
    <div className="flex w-full flex-wrap items-center gap-5">
      <svg
        width={tamanho}
        height={tamanho}
        role="img"
        aria-label="Situação das cobranças"
      >
        {/* Trilho: a rosca nunca é um vão. Com três cobranças o anel continua
            um anel, e dá para ver o quanto cada fatia ocupa do todo. */}
        <circle
          cx={centro}
          cy={centro}
          r={raioMedio}
          fill="none"
          stroke="var(--grafico-trilho)"
          strokeWidth={espessura}
        />
        {arcos
          .filter((a) => a.visivel)
          .map((a) => (
            <path
              key={a.rotulo}
              d={a.d}
              className="g-surge"
              fill="none"
              stroke={COR_ESTADO[a.estado] ?? "var(--serie-1)"}
              strokeWidth={espessura}
              strokeLinecap={a.redonda ? "round" : "butt"}
            />
          ))}

        {/* O miolo responde a pergunta de 5 segundos do card — quanto virou
            dinheiro — em vez de repetir o total, que a lista ao lado já soma.
            Veste `--foreground`: texto nunca usa cor de dado. */}
        <text
          x={centro}
          y={centro - 4}
          textAnchor="middle"
          fontSize={30}
          fontWeight={700}
          style={{ letterSpacing: "-0.02em" }}
          fill="var(--foreground)"
        >
          {`${percentualPago.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`}
        </text>
        <text
          x={centro}
          y={centro + 15}
          textAnchor="middle"
          fontSize={11}
          fontWeight={500}
          fill="var(--grafico-eixo)"
        >
          viraram pagamento
        </text>
        <text
          x={centro}
          y={centro + 31}
          textAnchor="middle"
          fontSize={11}
          fontWeight={500}
          style={{ fontVariantNumeric: "tabular-nums" }}
          fill="var(--grafico-eixo)"
        >
          {`${numero(pagas)} de ${numero(total)}`}
        </text>
      </svg>

      {/* Identidade nunca fica só na cor: cada fatia tem rótulo e número. */}
      <ul className="min-w-[150px] flex-1 space-y-1.5">
        {fatias.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{
                backgroundColor: COR_ESTADO[f.estado] ?? "var(--serie-1)",
              }}
            />
            <span className="flex-1 text-muted-foreground">{f.rotulo}</span>
            <strong className="font-semibold tabular-nums">
              {numero(f.valor)}
            </strong>
            <span className="w-12 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
              {((f.valor / total) * 100).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}
              %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
