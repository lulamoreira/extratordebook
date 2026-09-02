import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";

const NotFound = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader onGoHome={() => navigate("/", { replace: true })} />
    </div>
  );
};

export default NotFound;
