"use client";

/* =========================================================================
 *  Painel do organizador.
 *
 *  Três níveis de leitura, nesta ordem — inverter é o erro mais caro:
 *    1. Indicadores  ..... "estamos bem?"        5 segundos
 *    2. Gráficos     ..... "por quê?"            30 segundos
 *    3. Tabelas      ..... "onde exatamente?"    só quem precisa
 *
 *  Nenhum número é calculado aqui: tudo vem pronto do servidor, junto da
 *  conciliação, para o painel e o CSV nunca divergirem.
 * ========================================================================= */

import { useCallback, useState } from "react";
import {
  Download,
  KeyRound,
  RefreshCw,
  FlaskConical,
  Search,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RIFA, brl } from "@/lib/config";
import type { Conciliacao, Ganhador } from "@/lib/conciliacao";
import type { Kpi, PainelDados } from "@/lib/painel";
import type { LinhaVendedor } from "@/lib/vendedores";
import { CartaoKpi } from "./cartao-kpi";
import { DetalheKpi } from "./detalhe-kpi";
import { BotaoTema } from "./tema";
import { SecaoVendedores } from "./vendedores";
import {
  GraficoArea,
  GraficoBarra,
  GraficoHorizontal,
  GraficoLinha,
  GraficoRosca,
  Moldura,
} from "./graficos";

/* `pendentes` e `expirados` não chegam ao navegador de propósito — são dados
   pessoais de quem abandonou a compra, e a tela não usa nenhum dos dois. */
type Resposta = Omit<Conciliacao, "pendentes" | "expirados"> & {
  painel: PainelDados;
  vendedores: LinhaVendedor[];
  vendaDireta: { pedidos: number; cotas: number; valor: number };
};

const largura = String(RIFA.totalCotas).length;
const formatarCota = (n: number): string => String(n).padStart(largura, "0");

const dataBr = (ms: number | null): string =>
  ms
    ? new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";

export function PainelAdmin() {
  /* `senha` é o que está sendo digitado; `token` é o que o servidor já
     aceitou. Só o segundo abre o painel — o cliente nunca decide sozinho que
     alguém está autenticado. */
  const [senha, setSenha] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string>("");
  const [carregando, setCarregando] = useState<boolean>(false);

  const [baixando, setBaixando] = useState<boolean>(false);
  const [detalhe, setDetalhe] = useState<Kpi | null>(null);
  const [simulando, setSimulando] = useState<boolean>(false);
  const [real, setReal] = useState<Resposta | null>(null);
  const [numero, setNumero] = useState<string>("");
  const [ganhador, setGanhador] = useState<Ganhador | null>(null);
  const [erroGanhador, setErroGanhador] = useState<string>("");

  /**
   * Busca os dados e, só se o servidor aceitar, promove a senha digitada a
   * token validado. É o próprio servidor que decide — o cliente não guarda
   * nem valida senha nenhuma.
   */
  const carregar = useCallback(async (comToken: string): Promise<void> => {
    try {
      const resposta = await fetch("/api/admin/conciliacao", {
        headers: { Authorization: `Bearer ${comToken}` },
        cache: "no-store",
      });
      if (resposta.status === 401) {
        setErro("Senha incorreta.");
        setToken("");
        return;
      }
      if (resposta.status === 429) {
        setErro("Muitas tentativas deste dispositivo. Aguarde alguns minutos.");
        setToken("");
        return;
      }
      if (resposta.status === 404) {
        setErro(
          "O painel está desligado: falta configurar ADMIN_TOKEN nas variáveis de ambiente."
        );
        setToken("");
        return;
      }
      if (!resposta.ok) {
        setErro("Não foi possível carregar agora. Tente de novo.");
        return;
      }
      const corpo = (await resposta.json()) as Resposta;
      setDados(corpo);
      setReal(corpo);
      setSimulando(false);
      setErro("");
      setToken(comToken);
    } catch {
      setErro("Falha de conexão.");
    }
  }, []);

  /** Entrada manual e botão de atualizar: aqui o spinner faz sentido. */
  const carregarComSpinner = useCallback(
    async (comToken: string): Promise<void> => {
      setCarregando(true);
      setErro("");
      await carregar(comToken);
      setCarregando(false);
    },
    [carregar]
  );

  /* A senha vive só nesta aba, em memória: recarregar a página pede de novo.
     De propósito — o gerenciador de senhas do navegador preenche o campo, e
     assim o segredo do organizador não fica guardado no dispositivo. */
  const autenticado = Boolean(token);

  /**
   * Baixa o CSV por `fetch` com cabeçalho, não por link.
   *
   * Um `<a href="...?token=...">` mandaria o segredo do organizador para o log
   * de acesso da Vercel e para o histórico do navegador — e quem lesse esse
   * log teria nome e WhatsApp de todos os compradores.
   */
  async function baixarCsv(): Promise<void> {
    setBaixando(true);
    try {
      const resposta = await fetch("/api/admin/conciliacao?formato=csv", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!resposta.ok) {
        setErro("Não foi possível baixar a planilha.");
        return;
      }
      const endereco = URL.createObjectURL(await resposta.blob());
      const link = document.createElement("a");
      link.href = endereco;
      link.download = "conciliacao-rifa.csv";
      link.click();
      URL.revokeObjectURL(endereco);
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setBaixando(false);
    }
  }

  /**
   * Liga e desliga a simulação.
   *
   * Os dados vêm do servidor, do mesmo `montarPainel` que calcula o painel de
   * verdade — a simulação não tem código próprio de cálculo, senão uma hora
   * ela mostraria um painel que não existe.
   */
  async function alternarSimulacao(): Promise<void> {
    if (simulando) {
      setDados(real);
      setSimulando(false);
      return;
    }
    setCarregando(true);
    try {
      const resposta = await fetch("/api/admin/demonstracao", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!resposta.ok) {
        setErro("Não foi possível montar a simulação.");
        return;
      }
      setDados((await resposta.json()) as Resposta);
      setSimulando(true);
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setCarregando(false);
    }
  }

  async function procurarGanhador(
    evento: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    evento.preventDefault();
    setErroGanhador("");
    setGanhador(null);

    const procurado = Number(numero.trim());
    if (!/^\d{1,9}$/.test(numero.trim()) || procurado < 1) {
      setErroGanhador("Informe o número sorteado, só dígitos.");
      return;
    }

    /* Durante a simulação a busca tem que procurar DENTRO da simulação.
       Consultar o servidor aqui era o defeito visível: o painel dizia "776
       cotas vendidas" e a busca respondia "não foi vendido", porque uma coisa
       era inventada e a outra saía do banco de verdade. Uma tela que se
       contradiz destrói a confiança em todos os outros números dela. */
    if (simulando) {
      const dono = dados?.pagos.find((p) => p.numeros.includes(procurado));
      setGanhador({
        numero: procurado,
        encontrado: Boolean(dono),
        pedido: dono ?? null,
      });
      return;
    }

    try {
      const resposta = await fetch(
        `/api/admin/ganhador?numero=${encodeURIComponent(numero.trim())}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
      );
      const corpo = (await resposta.json()) as Ganhador & { erro?: string };
      if (!resposta.ok) {
        setErroGanhador(corpo.erro ?? "Não foi possível consultar.");
        return;
      }
      setGanhador(corpo);
    } catch {
      setErroGanhador("Falha de conexão.");
    }
  }

  /* ----------------------------------------------------------- Entrada -- */

  if (!autenticado) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4">
            <div className="text-center">
              <KeyRound className="mx-auto size-8 text-muted-foreground" />
              <h1 className="mt-3 text-xl font-extrabold">
                Painel do organizador
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{RIFA.titulo}</p>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (senha.trim()) void carregarComSpinner(senha.trim());
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="token">Senha de acesso</Label>
                <Input
                  id="token"
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="ADMIN_TOKEN"
                />
              </div>
              {erro && <p className="text-sm text-destructive">{erro}</p>}
              <Button type="submit" className="w-full" disabled={carregando}>
                {carregando ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  const p = dados?.painel;

  /* Maior número existente na simulação, para a busca sem resultado poder
     dizer onde procurar em vez de só negar. */
  const maiorSimulado = simulando
    ? (dados?.pagos ?? []).reduce(
        (maior, pedido) => Math.max(maior, ...pedido.numeros),
        0
      )
    : 0;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      {/* ------------------------------------------------------ Cabeçalho */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Painel do organizador</h1>
          <p className="text-sm text-muted-foreground">
            {RIFA.titulo} ·{" "}
            {p?.periodo ? `vendas de ${p.periodo}` : "ainda sem vendas"} ·
            sorteio em {RIFA.dataSorteioLabel}
            {p
              ? ` (${p.meta.diasRestantes === 1 ? "falta 1 dia" : `faltam ${p.meta.diasRestantes} dias`})`
              : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Atualizado em {dataBr(dados?.gerado ?? null)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BotaoTema />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void carregarComSpinner(token)}
            disabled={carregando}
          >
            <RefreshCw className={carregando ? "animate-spin" : ""} /> Atualizar
          </Button>
          <Button
            variant={simulando ? "default" : "outline"}
            size="sm"
            onClick={() => void alternarSimulacao()}
            disabled={carregando}
          >
            <FlaskConical /> {simulando ? "Sair da simulação" : "Ver simulação"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void baixarCsv()}
            disabled={baixando || simulando}
          >
            <Download /> {baixando ? "Baixando..." : "Baixar CSV"}
          </Button>
        </div>
      </header>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      {/* Aviso impossível de ignorar: uma captura desta tela não pode ser
          confundida com prestação de contas de verdade. */}
      {simulando && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-estado-atencao bg-secondary px-4 py-3">
          <FlaskConical className="size-5 shrink-0 text-estado-atencao" />
          <p className="text-sm">
            <strong>SIMULAÇÃO — nenhum destes números é real.</strong> É uma
            prévia de como o painel fica quando houver venda. Clique em{" "}
            <em>Sair da simulação</em> para voltar aos dados de verdade.
          </p>
        </div>
      )}

      {/* ------------------------------------- Nível 1: indicadores (5s) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {p?.kpis.map((kpi) => (
          <CartaoKpi key={kpi.id} kpi={kpi} aoAbrir={setDetalhe} />
        ))}
      </div>

      {/* Ressalvas: o que o painel NÃO consegue afirmar. */}
      {Boolean(p?.ressalvas.length) && (
        <ul className="space-y-1.5 rounded-xl border border-border bg-secondary p-4">
          {p?.ressalvas.map((r) => (
            <li
              key={r}
              className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ---------------------------------------- Nível 2: gráficos (30s) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Moldura
          titulo="Arrecadação acumulada rumo à meta"
          descricao={`Quanto já entrou, dia a dia, contra a meta de ${brl(p?.meta.arrecadacao ?? 0)}`}
          vazio={
            p?.temVenda
              ? undefined
              : "Sem vendas confirmadas ainda — o acumulado começa na primeira."
          }
        >
          {(w) => (
            <GraficoArea
              largura={w}
              pontos={p?.porDia ?? []}
              meta={p?.meta.arrecadacao ?? 0}
            />
          )}
        </Moldura>

        <Moldura
          titulo="Ritmo de venda por dia"
          descricao="Cotas vendidas a cada dia, comparadas ao ritmo que a meta exige"
          legenda={[
            { cor: "var(--serie-1)", rotulo: "Cotas vendidas no dia" },
            {
              cor: "var(--grafico-eixo)",
              rotulo: "Ritmo necessário",
              tracejada: true,
            },
          ]}
          vazio={
            p?.temVenda
              ? undefined
              : "Sem vendas confirmadas ainda — não há ritmo para medir."
          }
        >
          {(w) => (
            <GraficoLinha
              largura={w}
              pontos={p?.porDia ?? []}
              necessario={p?.ritmoNecessario ?? 0}
            />
          )}
        </Moldura>

        <Moldura
          titulo="Quais pacotes as pessoas escolhem"
          descricao="Cotas vendidas por tamanho de compra — mostra o que vale manter na página"
          vazio={
            p?.mixPacotes.length
              ? undefined
              : "Sem vendas confirmadas ainda para comparar os pacotes."
          }
        >
          {(w) => (
            <GraficoBarra
              largura={w}
              sufixo="cotas"
              rotulo="Cotas vendidas por tamanho de pacote"
              itens={(p?.mixPacotes ?? []).map((m) => ({
                rotulo: m.rotulo,
                valor: m.cotas,
              }))}
            />
          )}
        </Moldura>

        <Moldura
          titulo="Em que hora do dia as pessoas compram"
          descricao="Cotas por hora do pagamento — diz quando vale disparar no WhatsApp"
          vazio={
            p?.temVenda
              ? undefined
              : "Sem vendas confirmadas ainda para mapear os horários."
          }
        >
          {(w) => (
            <GraficoBarra
              largura={w}
              sufixo="cotas"
              rotulo="Cotas vendidas por hora do dia"
              rotularTodas={false}
              itens={(p?.vendasPorHora ?? []).map((valor, hora) => ({
                rotulo: hora % 3 === 0 ? `${hora}h` : "",
                valor,
              }))}
            />
          )}
        </Moldura>

        <Moldura
          titulo="Situação das cobranças agora"
          descricao="De cada cobrança gerada, o que virou pagamento e o que ficou pelo caminho"
          vazio={
            dados?.totais.pedidos
              ? undefined
              : "Nenhuma cobrança gerada ainda."
          }
        >
          {(w) => <GraficoRosca largura={w} fatias={p?.situacao ?? []} />}
        </Moldura>

        <Moldura
          titulo="Quem mais comprou"
          descricao="Dez maiores compradores por quantidade de cotas"
          vazio={
            p?.maioresCompradores.length
              ? undefined
              : "Sem compradores confirmados ainda."
          }
        >
          {(w) => (
            <GraficoHorizontal
              largura={w}
              itens={(p?.maioresCompradores ?? []).map((c) => ({
                rotulo: c.nome,
                valor: c.cotas,
                detalhe: brl(c.valor),
              }))}
            />
          )}
        </Moldura>
      </div>

      {/* -------------------------------------- Vendedores (48 pessoas) */}
      <SecaoVendedores
        token={token}
        ranking={dados?.vendedores ?? []}
        direta={dados?.vendaDireta ?? { pedidos: 0, cotas: 0, valor: 0 }}
        simulando={simulando}
        aoMudarCadastro={() => void carregar(token)}
      />

      {/* ------------------------------------- Nível 3: detalhe (2 min) */}
      <Card>
        <CardContent className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Search className="size-5" /> Buscar ganhador
            </h2>
            <p className="text-sm text-muted-foreground">
              Digite o número sorteado para ver quem ficou com ele.
              {simulando && " Buscando dentro da simulação."}
            </p>
          </div>

          <form className="flex gap-2" onSubmit={(e) => void procurarGanhador(e)}>
            <Input
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              // Sem faixa "1 a N": o lote de hoje é isca de escassez e sobe
              // conforme a meta se aproxima. Um teto anunciado aqui
              // envelheceria errado no dia em que o lote mudasse.
              placeholder="Número sorteado"
              aria-label="Número sorteado"
            />
            <Button type="submit">Buscar</Button>
          </form>

          {erroGanhador && (
            <p className="text-sm text-destructive">{erroGanhador}</p>
          )}

          {ganhador && !ganhador.encontrado && (
            <p className="rounded-lg bg-secondary px-4 py-3 text-sm">
              O número {formatarCota(ganhador.numero)} não foi vendido — nenhum
              pagamento confirmado corresponde a ele.
              {simulando && maiorSimulado > 0 && (
                <>
                  {" "}
                  Na simulação existem os números de {formatarCota(1)} a{" "}
                  {formatarCota(maiorSimulado)}.
                </>
              )}
            </p>
          )}

          {ganhador?.pedido && (
            <div className="rounded-xl border border-verde">
              {(
                [
                  ["Número", formatarCota(ganhador.numero)],
                  ["Nome", ganhador.pedido.nome],
                  ["WhatsApp", ganhador.pedido.whatsapp],
                  ["Pedido", ganhador.pedido.id],
                  ["Cotas", String(ganhador.pedido.cotas)],
                  ["Valor pago", brl(ganhador.pedido.valor)],
                  ["Pagamento", dataBr(ganhador.pedido.pagoEm)],
                ] as Array<[string, string]>
              ).map(([rotulo, valor], indice) => (
                <div key={rotulo}>
                  {indice > 0 && <Separator />}
                  <div className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{rotulo}</span>
                    <strong className="text-right break-all">{valor}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="text-lg font-extrabold">Últimas vendas</h2>

          {!dados?.pagos.length && (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda confirmada ainda.
            </p>
          )}

          <div className="space-y-2">
            {dados?.pagos.slice(0, 15).map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-secondary px-3 py-2 text-sm"
              >
                <div>
                  <strong>{v.nome}</strong>{" "}
                  <span className="text-muted-foreground">
                    · {v.cotas} {v.cotas === 1 ? "cota" : "cotas"} ·{" "}
                    {brl(v.valor)}
                  </span>
                  <div className="font-mono text-xs text-muted-foreground">
                    {resumirNumeros(v.numeros)}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {dataBr(v.pagoEm)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {detalhe && (
        <DetalheKpi kpi={detalhe} aoFechar={() => setDetalhe(null)} />
      )}

      {Boolean(dados?.reembolsar.length) && (
        <Card className="border-destructive">
          <CardContent className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-destructive">
              <TriangleAlert className="size-5" /> Pagamentos a devolver
            </h2>
            <p className="text-sm text-muted-foreground">
              O Pix foi pago, mas não havia cota disponível. Devolva o valor e
              avise pelo WhatsApp.
            </p>
            <div className="space-y-2">
              {dados?.reembolsar.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm"
                >
                  <span>
                    <strong>{r.nome}</strong> · {r.whatsapp} · pedido {r.id}
                  </span>
                  <strong>{brl(r.valor)}</strong>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

/**
 * Resume os números do pedido: `0154 a 0158` quando a faixa é contínua (o caso
 * normal, porque a atribuição é sequencial), senão lista os números.
 */
function resumirNumeros(numeros: number[]): string {
  if (!numeros.length) return "";
  const ordenados = [...numeros].sort((a, b) => a - b);
  const contiguo = ordenados.every(
    (n, i) => i === 0 || n === ordenados[i - 1] + 1
  );
  if (contiguo && ordenados.length > 2) {
    return `${formatarCota(ordenados[0])} a ${formatarCota(ordenados[ordenados.length - 1])}`;
  }
  return ordenados.map(formatarCota).join(", ");
}
