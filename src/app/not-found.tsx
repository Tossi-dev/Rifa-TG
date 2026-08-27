import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RIFA } from "@/lib/config";

export default function NaoEncontrado() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <Card className="w-full max-w-md text-center">
        <CardContent className="space-y-4">
          <h1 className="text-2xl font-extrabold">Página não encontrada</h1>
          <p className="text-muted-foreground">
            O link que você abriu não existe ou o pedido já não está mais
            disponível.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link href="/">Ir para a {RIFA.titulo}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
