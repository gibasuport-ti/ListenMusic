import { useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Music, Loader2, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

export function Auth() {
  const { loginWithGoogle } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await loginWithGoogle();
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-blocked') {
        toast.error("O popup de login foi bloqueado pelo seu navegador. Por favor, permita popups para este site.");
      } else {
        toast.error("Erro ao entrar com Google. Tente novamente.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-white p-6 overflow-hidden relative">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-600/10 blur-[150px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center space-y-10 max-w-md w-full z-10 bg-white/5 backdrop-blur-2xl p-12 rounded-[40px] border border-white/10 shadow-2xl"
      >
        <div className="flex flex-col items-center space-y-4">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-600/20">
            <Music className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white">ListenMusic</h1>
        </div>
        
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-white tracking-tight">Sua música, seu jeito.</h2>
          <p className="text-zinc-500 font-medium leading-relaxed">
            Conecte-se para acessar sua biblioteca pessoal e fazer upload das suas faixas favoritas.
          </p>
        </div>

        <div className="w-full space-y-4">
          <Button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-7 rounded-2xl text-lg transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center space-x-3 h-auto"
          >
            {isLoggingIn ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 bg-white rounded-full p-1" alt="" />
                <span>Entrar com Google</span>
              </>
            )}
          </Button>

          <div className="flex items-center justify-center space-x-2 text-zinc-600">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Autenticação Segura</span>
          </div>
        </div>

        <p className="text-[10px] text-zinc-600 text-center font-medium max-w-[240px] leading-relaxed">
          Ao entrar, você concorda com nossos <span className="text-zinc-400 hover:text-blue-400 cursor-pointer transition-colors">Termos de Uso</span> e <span className="text-zinc-400 hover:text-blue-400 cursor-pointer transition-colors">Políticas de Privacidade</span>.
        </p>
      </motion.div>

      {/* Footer Branding */}
      <div className="absolute bottom-10 text-zinc-700 text-[10px] font-bold uppercase tracking-[0.3em]">
        ListenMusic &copy; 2026
      </div>
    </div>
  );
}
