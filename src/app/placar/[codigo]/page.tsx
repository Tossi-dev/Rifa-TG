import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy, Users } from "lucide-react";

import { AcoesPlacar } from "@/components/rifa/acoes-placar";
import { Cabecalho } from "@/components/rifa/cabecalho";
import { Card, CardContent } from "@/components/ui/card";
import { RIFA, brl } from "@/lib/config";
import { montarConciliacao } from "@/lib/conciliacao";
import { buscarVendedor, listarVendedores } from "@/lib/store";
import {
  codigoValido,
  linkDoVendedor,
  mensagemDeVenda,
  primeiroNome,
  rankingVendedores,
} from "@/lib/vendedores";

export const dynamic = "force-dynamic";

/* Nada de indexar no Google: o placar é para o vendedor, não é página de
   campanha. Sem isto, buscar o nome de alguém traria quanto essa pessoa
   vendeu numa rifa beneficente. */
export const metadata = { robots: { index: false, follow: false } };

const base = (process.env.NEXT_PUBLIC_BASE_URL || "").trim();

/**
 * Placar pessoal do vendedor.
 *
 * O que aparece: as cotas dele, o valor, a posição e o ranking pelos
 * primeiros nomes. O que NÃO aparece, em hipótese alguma: nome, WhatsApp,
 * CPF ou número de comprador. Este link vai circular no grupo do WhatsApp da
 * turma — tratar como página pública é a única postura segura.
 */
export default async function Placar({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const limpo = decodeURIComponent(codigo ?? "").toLowerCase();
  if (!codigoValido(limpo)) notFound();

  const vendedor = await buscarVendedor(limpo);
  if (!vendedor) notFound();

  const [dados, todos] = await Promise.all([montarConciliacao(), listarVendedores()]);
  const ranking = rankingVendedores(todos, dados.pagos);

  const eu = ranking.find((l) => l.codigo === limpo);
  const posicao = ranking.findIndex((l) => l.codigo === limpo) + 1;
  const cotas = eu?.cotas ?? 0;
  const valor = eu?.valor ?? 0;
  const totalCotas = ranking.reduce((s, l) => s + l.cotas, 0);

  const meuLink = linkDoVendedor(base || "https://rifa-tg.vercel.app", limpo);

  return (
    <>
      <Cabecalho />

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        <div>
          <p className="text-sm text-muted-foreground">Placar de vendas</p>
          <h1 className="text-2xl font-extrabold">{vendedor.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {RIFA.titulo} · sorteio em {RIFA.dataSorteioLabel}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent>
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                Cotas vendidas
              </p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">
                {cotas.toLocaleString("pt-BR")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                Valor arrecadado
              </p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">
                {brl(valor)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                Sua posição
              </p>
              <p className="mt-1 flex items-baseline gap-1 text-3xl font-extrabold tabular-nums">
                {cotas > 0 ? `${posicao}º` : "—"}
                <span className="text-sm font-medium text-muted-foreground">
                  de {ranking.length}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Trophy className="size-5" /> Seu link de venda
            </h2>
            <p className="text-sm text-muted-foreground">
              Toda compra feita por este link entra na sua conta
              automaticamente. Mande no WhatsApp, no story, onde quiser.
            </p>
            <p className="rounded-lg bg-secondary px-4 py-3 font-mono text-sm break-all">
              {meuLink}
            </p>

            <AcoesPlacar
              link={meuLink}
              mensagem={mensagemDeVenda(
                meuLink,
                RIFA.titulo,
                RIFA.premios[0].nome,
                brl(RIFA.precoCota),
                RIFA.dataSorteioLabel
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Users className="size-5" /> Como está a turma
            </h2>

            {totalCotas === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ninguém vendeu ainda. O primeiro número muda esse quadro.
              </p>
            ) : (
              <ol className="space-y-1">
                {ranking
                  .filter((l) => l.cotas > 0)
                  .map((l, i) => {
                    const souEu = l.codigo === limpo;
                    return (
                      <li
                        key={l.codigo}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                          souEu ? "bg-verde-claro font-bold" : ""
                        }`}
                      >
                        <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                          {i + 1}.
                        </span>
                        {/* Primeiro nome e inicial do sobrenome: dá para se
                            reconhecer na lista sem publicar o nome completo
                            de 48 pessoas numa página aberta. */}
                        <span className="flex-1 truncate">
                          {souEu ? "Você" : primeiroNome(l.nome)}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {l.cotas.toLocaleString("pt-BR")}
                        </span>
                      </li>
                    );
                  })}
              </ol>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm">
          <Link href="/" className="font-semibold text-verde underline">
            Ver a página da rifa
          </Link>
        </p>
      </main>
    </>
  );
}
