import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

const PendingApproval = () => {
  const { signOut, profile, refreshProfile } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto rounded-full bg-muted p-4 w-fit mb-2">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">
            {profile?.status === "rejected" ? "Acesso Negado" : "Aguardando Aprovação"}
          </CardTitle>
          <CardDescription>
            {profile?.status === "rejected"
              ? "Seu acesso foi negado pelo administrador. Entre em contato se acredita que isso foi um erro."
              : "Seu cadastro foi recebido e está aguardando aprovação do administrador. Você receberá acesso assim que for aprovado."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" onClick={refreshProfile}>
            Verificar status
          </Button>
          <Button variant="ghost" onClick={signOut}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApproval;
