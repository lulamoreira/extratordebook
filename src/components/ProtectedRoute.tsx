import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ProtectedRoute = ({ children, requireAdmin = false }: Props) => {
  const { session, profile, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Carregando...</p>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;

  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;

  if (!requireAdmin && profile && profile.status !== "approved" && !isAdmin) {
    return <Navigate to="/pending" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
