import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado no aplicativo.";
      let isPermissionError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.error.includes("insufficient permissions")) {
            errorMessage = `Erro de permissão no Firestore (${parsed.operationType} em ${parsed.path}). Verifique as regras de segurança.`;
            isPermissionError = true;
          } else {
            errorMessage = parsed.error || errorMessage;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-zinc-100 p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-600/10 blur-[120px] rounded-full" />
          </div>
          
          <div className="z-10 bg-white/5 backdrop-blur-2xl p-12 rounded-[40px] border border-white/10 shadow-2xl max-w-lg w-full">
            <div className="w-20 h-20 bg-red-600/20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-red-500/20">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-3xl font-black mb-4 tracking-tight">Ops! Algo deu errado.</h1>
            <p className="text-zinc-500 mb-10 font-medium leading-relaxed">
              {errorMessage}
            </p>
            <div className="flex flex-col space-y-4">
              <Button 
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 rounded-2xl text-lg shadow-xl shadow-blue-600/20 h-auto"
              >
                Recarregar Aplicativo
              </Button>
              {isPermissionError && (
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                  Dica: Verifique se você está logado corretamente.
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
