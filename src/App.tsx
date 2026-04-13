import React, { useState, useEffect, useMemo } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { getStyleSuggestion } from './services/geminiService';
import { 
  Calendar, 
  Clock, 
  Users, 
  Scissors, 
  ChevronRight, 
  Plus, 
  CheckCircle2, 
  XCircle,
  Bell,
  MapPin,
  Phone,
  Instagram,
  Facebook,
  LogIn,
  LogOut,
  Database,
  LayoutDashboard,
  Settings,
  Trash2,
  Edit3,
  Save,
  TrendingUp,
  DollarSign,
  Mail,
  Lock,
  User as UserIcon,
  Sparkles
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from './lib/utils';
import { Haircut, Appointment } from './types';
import { motion, AnimatePresence } from 'motion/react';

// Firebase Imports
import { auth, googleProvider, db } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  orderBy,
  serverTimestamp,
  getDocs,
  writeBatch,
  getDocFromServer
} from 'firebase/firestore';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      try {
        const errInfo = JSON.parse(this.state.error?.message || "");
        if (errInfo.error) {
          errorMessage = `Erro no banco de dados: ${errInfo.error}`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center border border-red-100">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Ops! Algo deu errado</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type UnifiedUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: 'firebase';
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export default function App() {
  const [user, setUser] = useState<UnifiedUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [haircuts, setHaircuts] = useState<Haircut[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoadingHaircuts, setIsLoadingHaircuts] = useState(true);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [selectedHaircut, setSelectedHaircut] = useState<Haircut | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'catalog' | 'queue' | 'admin'>('catalog');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Admin State
  const [editingHaircut, setEditingHaircut] = useState<Partial<Haircut> | null>(null);
  const [isHaircutModalOpen, setIsHaircutModalOpen] = useState(false);

  // AI State
  const [aiPreference, setAiPreference] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const isAdmin = user?.email === 'CrazzyMonks@gmail.com';

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    // Listen to Firebase Auth
    const unsubscribeFirebase = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          provider: 'firebase'
        });
        setError(null);
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => {
      unsubscribeFirebase();
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    // Fetch and Subscribe to Haircuts
    const haircutsQuery = query(collection(db, 'haircuts'), orderBy('price', 'asc'));
    const unsubscribeHaircuts = onSnapshot(haircutsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Haircut));
      setHaircuts(data);
      setIsLoadingHaircuts(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'haircuts');
    });

    // Fetch and Subscribe to Appointments
    const appointmentsQuery = query(collection(db, 'appointments'), orderBy('startTime', 'asc'));
    const unsubscribeAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(data);
      setIsLoadingAppointments(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'appointments');
    });

    return () => {
      unsubscribeHaircuts();
      unsubscribeAppointments();
    };
  }, [isAuthReady]);

  const handleLogin = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      // Ignore if user closed the popup, as they might have still logged in successfully
      // or simply changed their mind.
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Login error:', err);
      setError(`Falha ao entrar com Google: ${err?.message || 'Erro desconhecido'}`);
    }
  };

  const handleLogout = async () => {
    await firebaseSignOut(auth);
    setUser(null);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAuthenticating(true);

    if (authMode === 'register' && password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      setIsAuthenticating(false);
      return;
    }

    try {
      if (authMode === 'register') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
          displayName: email.split('@')[0]
        });
        
        // Create user document in Firestore
        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            email: userCredential.user.email,
            displayName: email.split('@')[0],
            role: 'user',
            createdAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'users');
        }

        setSuccess('Cadastro realizado com sucesso!');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setIsAuthModalOpen(false);
      setEmail('');
      setPassword('');
    } catch (err: any) {
      console.error('Auth error:', err);
      let message = err.message || 'Erro desconhecido';
      if (err.code === 'auth/operation-not-allowed') {
        message = 'O provedor de E-mail/Senha não está habilitado no Console do Firebase. Por favor, habilite-o ou use o login com Google.';
      } else if (err.code === 'auth/email-already-in-use') {
        message = 'Este e-mail já está em uso.';
      } else if (err.code === 'auth/weak-password') {
        message = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'E-mail inválido.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        message = 'E-mail ou senha incorretos.';
      }
      setError(`Erro na autenticação: ${message}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const updateAppointmentStatus = async (id: string, status: Appointment['status']) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'appointments', id), { status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appointments');
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'appointments', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'appointments');
    }
  };

  const handleAiSuggestion = async () => {
    if (!aiPreference.trim()) return;
    setIsAiLoading(true);
    setAiSuggestion(null);
    try {
      const suggestion = await getStyleSuggestion(aiPreference);
      setAiSuggestion(suggestion);
    } catch (err: any) {
      console.error('AI Error:', err);
      setError(`Erro na IA: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleHaircutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingHaircut) return;

    try {
      if (editingHaircut.id) {
        const { id, ...data } = editingHaircut;
        await updateDoc(doc(db, 'haircuts', id), data);
      } else {
        await addDoc(collection(db, 'haircuts'), editingHaircut);
      }
      setIsHaircutModalOpen(false);
      setEditingHaircut(null);
    } catch (err) {
      handleFirestoreError(err, editingHaircut.id ? OperationType.UPDATE : OperationType.CREATE, 'haircuts');
    }
  };

  const deleteHaircut = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'haircuts', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'haircuts');
    }
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Você precisa estar logado para agendar.');
      return;
    }
    if (!selectedHaircut || !customerName || !bookingTime) return;

    try {
      const startTime = new Date(`${format(new Date(), 'yyyy-MM-dd')}T${bookingTime}`).toISOString();
      await addDoc(collection(db, 'appointments'), {
        customerName,
        customerEmail: user.email,
        haircutId: selectedHaircut.id,
        startTime,
        status: 'waiting',
        uid: user.uid,
        createdAt: serverTimestamp()
      });

      setIsBookingModalOpen(false);
      setCustomerName('');
      setBookingTime('');
      setSelectedHaircut(null);
      setActiveTab('queue');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'appointments');
    }
  };

  const seedData = async () => {
    if (!isAdmin) return;
    const initialHaircuts = [
      { name: "Degradê Navalhado", price: 45, duration: 40, image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&auto=format&fit=crop", description: "Corte moderno com transição suave na navalha." },
      { name: "Social Clássico", price: 35, duration: 30, image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop", description: "O corte tradicional para o dia a dia." },
      { name: "Barba Completa", price: 30, duration: 25, image: "https://images.unsplash.com/photo-1590540179852-2110a54f813a?w=800&auto=format&fit=crop", description: "Desenho, hidratação e toalha quente." },
      { name: "Corte + Barba", price: 70, duration: 60, image: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&auto=format&fit=crop", description: "Combo completo para renovar o visual." },
    ];

    try {
      const batch = writeBatch(db);
      initialHaircuts.forEach(haircut => {
        const newDoc = doc(collection(db, 'haircuts'));
        batch.set(newDoc, haircut);
      });
      await batch.commit();
      setSuccess('Dados iniciais criados com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'haircuts');
    }
  };

  const sortedAppointments = useMemo(() => {
    return [...appointments]
      .filter(app => app.status !== 'completed' && app.status !== 'cancelled')
      .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
  }, [appointments]);

  const currentService = sortedAppointments.find(app => app.status === 'in-service');
  const nextInQueue = sortedAppointments.filter(app => app.status === 'waiting');

  const stats = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayAppointments = appointments.filter(app => format(parseISO(app.startTime), 'yyyy-MM-dd') === today);
    const completedToday = todayAppointments.filter(app => app.status === 'completed');
    const revenue = completedToday.reduce((acc, app) => {
      const haircut = haircuts.find(h => h.id === app.haircutId);
      return acc + (haircut?.price || 0);
    }, 0);

    return {
      totalToday: todayAppointments.length,
      completedToday: completedToday.length,
      revenueToday: revenue,
      waiting: nextInQueue.length
    };
  }, [appointments, haircuts, nextInQueue]);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white font-sans selection:bg-amber-500 selection:text-black">
      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-red-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3"
          >
            <XCircle className="w-5 h-5" />
            <span className="text-sm font-bold">{error}</span>
            <button onClick={() => setError(null)} className="ml-2 opacity-50 hover:opacity-100">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-green-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-bold">{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-2 opacity-50 hover:opacity-100">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0F0F0F]/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
              <Scissors className="text-black w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tighter uppercase italic">BarberFlow</h1>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-widest opacity-60">
            <button 
              onClick={() => setActiveTab('catalog')}
              className={cn("hover:opacity-100 transition-opacity", activeTab === 'catalog' && "opacity-100 text-amber-500")}
            >
              Catálogo
            </button>
            <button 
              onClick={() => setActiveTab('queue')}
              className={cn("hover:opacity-100 transition-opacity", activeTab === 'queue' && "opacity-100 text-amber-500")}
            >
              Fila ao Vivo
            </button>
            {isAdmin && (
              <button 
                onClick={() => setActiveTab('admin')}
                className={cn("hover:opacity-100 transition-opacity flex items-center gap-2", activeTab === 'admin' && "opacity-100 text-amber-500")}
              >
                <LayoutDashboard className="w-4 h-4" /> Admin
              </button>
            )}
            {isAdmin && (
              <button onClick={seedData} className="text-amber-500/50 hover:text-amber-500 flex items-center gap-1">
                <Database className="w-4 h-4" /> Seed
              </button>
            )}
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-white/20" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-black font-bold text-xs">
                    {user.email?.[0].toUpperCase() || 'U'}
                  </div>
                )}
                <button 
                  onClick={handleLogout}
                  className="text-white/40 hover:text-white transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => {
                    if (haircuts.length > 0) setSelectedHaircut(haircuts[0]);
                    setIsBookingModalOpen(true);
                  }}
                  className="bg-amber-500 text-black px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-amber-400 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Agendar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsAuthModalOpen(true)}
                  className="text-white/60 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors"
                >
                  Entrar com E-mail
                </button>
                <button 
                  onClick={handleLogin}
                  className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider hover:bg-white/90 transition-colors flex items-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Google
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <section className="mb-20 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="flex-1">
            <span className="text-amber-500 text-xs font-bold uppercase tracking-[0.3em] mb-4 block">Estilo & Tradição</span>
            <h2 className="text-6xl md:text-8xl font-bold tracking-tighter leading-[0.9] uppercase mb-6">
              Onde a arte <br /> encontra o <span className="italic text-amber-500">corte</span>.
            </h2>
            <p className="text-white/40 max-w-md text-lg leading-relaxed mb-8">
              Mais que uma barbearia, um refúgio para o homem moderno que não abre mão da excelência.
            </p>

            {/* AI Suggestion Box */}
            <div className="max-w-md bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-amber-500 mb-4">
                <Sparkles className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-widest">Sugestão de Estilo com IA</span>
              </div>
              <div className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  value={aiPreference}
                  onChange={(e) => setAiPreference(e.target.value)}
                  placeholder="Ex: Quero um corte moderno e curto..."
                  className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-amber-500 focus:outline-none transition-colors"
                />
                <button 
                  onClick={handleAiSuggestion}
                  disabled={isAiLoading || !aiPreference.trim()}
                  className="bg-amber-500 text-black px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  {isAiLoading ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : 'Pedir'}
                </button>
              </div>
              {aiSuggestion && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-sm text-white/80 italic leading-relaxed border-t border-white/5 pt-4"
                >
                  "{aiSuggestion}"
                </motion.div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col gap-4 p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-3 text-amber-500">
              <Clock className="w-5 h-5" />
              <span className="font-bold uppercase tracking-widest text-sm">Status da Fila</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold tracking-tighter">{nextInQueue.length}</div>
              <div className="text-xs uppercase tracking-widest opacity-40 leading-tight">
                Pessoas <br /> aguardando
              </div>
            </div>
          </div>
        </section>

        {/* Tabs Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'catalog' ? (
            <motion.section 
              key="catalog"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              {isLoadingHaircuts ? (
                <div className="col-span-full py-20 text-center">
                  <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white/20 uppercase tracking-widest font-bold">Carregando catálogo...</p>
                </div>
              ) : haircuts.length > 0 ? (
                haircuts.map((haircut) => (
                  <div 
                    key={haircut.id} 
                    className="group relative bg-white/5 border border-white/10 rounded-3xl overflow-hidden hover:border-amber-500/50 transition-all"
                  >
                    <div className="aspect-[3/4] overflow-hidden">
                      <img 
                        src={haircut.image} 
                        alt={haircut.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all duration-700"
                      />
                    </div>
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xl font-bold uppercase tracking-tight">{haircut.name}</h3>
                        <span className="text-amber-500 font-bold">R$ {haircut.price}</span>
                      </div>
                      <p className="text-white/40 text-sm mb-6 line-clamp-2">{haircut.description}</p>
                      <button 
                        onClick={() => {
                          if (!user) {
                            handleLogin();
                            return;
                          }
                          setSelectedHaircut(haircut);
                          setIsBookingModalOpen(true);
                        }}
                        className="w-full py-3 border border-white/20 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-all flex items-center justify-center gap-2"
                      >
                        Selecionar <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-white/10 rounded-3xl">
                  <p className="text-white/20 uppercase tracking-widest font-bold mb-4">Catálogo Vazio</p>
                  {!user ? (
                    <div className="space-y-4">
                      <p className="text-sm text-white/40 max-w-xs mx-auto">
                        Se você é o administrador, entre com sua conta para configurar os serviços iniciais.
                      </p>
                      <button 
                        onClick={handleLogin}
                        className="bg-white text-black px-8 py-3 rounded-full font-bold uppercase text-xs tracking-widest hover:bg-white/90 transition-colors flex items-center gap-2 mx-auto"
                      >
                        <LogIn className="w-4 h-4" /> Entrar como Admin
                      </button>
                    </div>
                  ) : isAdmin ? (
                    <div className="mt-4 space-y-4">
                      <p className="text-sm text-white/40">Você está logado como administrador. Clique abaixo para popular o catálogo:</p>
                      <button 
                        onClick={seedData} 
                        className="bg-amber-500 text-black px-8 py-3 rounded-full font-bold uppercase text-xs tracking-widest hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                      >
                        Criar dados iniciais
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-white/40 italic">Aguarde o administrador configurar os serviços.</p>
                  )}
                </div>
              )}
            </motion.section>
          ) : activeTab === 'queue' ? (
            <motion.section 
              key="queue"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Current Service */}
              {currentService && (
                <div className="bg-amber-500 text-black p-8 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-black/10 rounded-full flex items-center justify-center animate-pulse">
                      <Scissors className="w-10 h-10" />
                    </div>
                    <div>
                      <span className="text-xs font-bold uppercase tracking-widest opacity-60">Em Atendimento</span>
                      <h3 className="text-4xl font-black uppercase tracking-tighter">{currentService.customerName}</h3>
                      <p className="font-medium opacity-80">{haircuts.find(h => h.id === currentService.haircutId)?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold uppercase tracking-widest opacity-60">Início</span>
                    <div className="text-4xl font-black tracking-tighter">
                      {format(parseISO(currentService.startTime), 'HH:mm')}
                    </div>
                  </div>
                </div>
              )}

              {/* Queue List */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-2xl font-bold uppercase tracking-tighter flex items-center gap-3">
                    <Users className="text-amber-500" /> Próximos da Fila
                  </h3>
                  <div className="space-y-3">
                    {nextInQueue.length > 0 ? nextInQueue.map((app, index) => (
                      <div 
                        key={app.id}
                        className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-6">
                          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-lg font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <h4 className="font-bold uppercase tracking-tight">{app.customerName}</h4>
                            <p className="text-xs text-white/40 uppercase tracking-widest">
                              {haircuts.find(h => h.id === app.haircutId)?.name}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold tracking-tighter text-amber-500">
                            {format(parseISO(app.startTime), 'HH:mm')}
                          </div>
                          <div className="text-[10px] uppercase tracking-widest opacity-40">Horário Previsto</div>
                        </div>
                      </div>
                    )) : (
                      <div className="py-20 text-center border-2 border-dashed border-white/10 rounded-3xl">
                        <p className="text-white/20 uppercase tracking-widest font-bold">Fila Vazia</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-8 bg-amber-500/10 border border-amber-500/20 rounded-3xl">
                    <h4 className="text-lg font-bold uppercase tracking-tighter mb-4 flex items-center gap-2">
                      <Bell className="w-5 h-5 text-amber-500" /> Lembrete
                    </h4>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Chegue com 10 minutos de antecedência para garantir seu horário. Atrasos superiores a 15 minutos podem resultar no cancelamento do agendamento.
                    </p>
                  </div>
                  
                  <div className="p-8 bg-white/5 border border-white/10 rounded-3xl space-y-4">
                    <h4 className="text-lg font-bold uppercase tracking-tighter">Informações</h4>
                    <div className="space-y-3 text-sm text-white/40">
                      <div className="flex items-center gap-3">
                        <MapPin className="w-4 h-4 text-amber-500" />
                        <span>Rua dos Barbeiros, 123 - Centro</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone className="w-4 h-4 text-amber-500" />
                        <span>(11) 99999-9999</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          ) : (
            <motion.section 
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Dashboard Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white/5 border border-white/10 p-6 rounded-3xl">
                  <div className="flex items-center gap-3 text-amber-500 mb-4">
                    <Calendar className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Total Hoje</span>
                  </div>
                  <div className="text-3xl font-black tracking-tighter">{stats.totalToday}</div>
                </div>
                <div className="bg-white/5 border border-white/10 p-6 rounded-3xl">
                  <div className="flex items-center gap-3 text-green-500 mb-4">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Concluídos</span>
                  </div>
                  <div className="text-3xl font-black tracking-tighter">{stats.completedToday}</div>
                </div>
                <div className="bg-white/5 border border-white/10 p-6 rounded-3xl">
                  <div className="flex items-center gap-3 text-amber-500 mb-4">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Aguardando</span>
                  </div>
                  <div className="text-3xl font-black tracking-tighter">{stats.waiting}</div>
                </div>
                <div className="bg-amber-500 text-black p-6 rounded-3xl">
                  <div className="flex items-center gap-3 mb-4">
                    <DollarSign className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Receita Hoje</span>
                  </div>
                  <div className="text-3xl font-black tracking-tighter">R$ {stats.revenueToday}</div>
                </div>
              </div>

              {/* Admin Tabs */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Appointment Management */}
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold uppercase tracking-tighter flex items-center gap-3">
                    <Clock className="text-amber-500" /> Gerenciar Agenda
                  </h3>
                  <div className="space-y-3">
                    {appointments.length > 0 ? appointments.map((app) => (
                      <div 
                        key={app.id}
                        className={cn(
                          "p-6 border rounded-2xl transition-all",
                          app.status === 'completed' ? "bg-green-500/5 border-green-500/20 opacity-60" :
                          app.status === 'cancelled' ? "bg-red-500/5 border-red-500/20 opacity-60" :
                          app.status === 'in-service' ? "bg-amber-500/10 border-amber-500/40" :
                          "bg-white/5 border-white/10"
                        )}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h4 className="font-bold uppercase tracking-tight">{app.customerName}</h4>
                            <p className="text-xs text-white/40 uppercase tracking-widest">
                              {haircuts.find(h => h.id === app.haircutId)?.name} • {format(parseISO(app.startTime), 'HH:mm')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {app.status === 'waiting' && (
                              <button 
                                onClick={() => updateAppointmentStatus(app.id, 'in-service')}
                                className="p-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-colors"
                                title="Iniciar Atendimento"
                              >
                                <Scissors className="w-4 h-4" />
                              </button>
                            )}
                            {app.status === 'in-service' && (
                              <button 
                                onClick={() => updateAppointmentStatus(app.id, 'completed')}
                                className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-400 transition-colors"
                                title="Concluir"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            {(app.status === 'waiting' || app.status === 'in-service') && (
                              <button 
                                onClick={() => updateAppointmentStatus(app.id, 'cancelled')}
                                className="p-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                                title="Cancelar"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => deleteAppointment(app.id)}
                              className="p-2 text-white/20 hover:text-red-500 transition-colors"
                              title="Excluir Registro"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md",
                            app.status === 'waiting' ? "bg-amber-500/20 text-amber-500" :
                            app.status === 'in-service' ? "bg-blue-500/20 text-blue-500" :
                            app.status === 'completed' ? "bg-green-500/20 text-green-500" :
                            "bg-red-500/20 text-red-500"
                          )}>
                            {app.status === 'waiting' ? 'Aguardando' :
                             app.status === 'in-service' ? 'Em Atendimento' :
                             app.status === 'completed' ? 'Concluído' : 'Cancelado'}
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div className="py-10 text-center border-2 border-dashed border-white/10 rounded-3xl">
                        <p className="text-white/20 uppercase tracking-widest font-bold">Sem agendamentos</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Haircut Management */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold uppercase tracking-tighter flex items-center gap-3">
                      <Scissors className="text-amber-500" /> Serviços
                    </h3>
                    <button 
                      onClick={() => {
                        setEditingHaircut({ name: '', price: 0, duration: 30, description: '', image: '' });
                        setIsHaircutModalOpen(true);
                      }}
                      className="p-2 bg-white text-black rounded-full hover:bg-amber-500 transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {haircuts.map((haircut) => (
                      <div 
                        key={haircut.id}
                        className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl"
                      >
                        <div className="flex items-center gap-4">
                          <img src={haircut.image} className="w-12 h-12 rounded-xl object-cover grayscale" alt="" />
                          <div>
                            <h4 className="font-bold uppercase tracking-tight text-sm">{haircut.name}</h4>
                            <p className="text-xs text-amber-500">R$ {haircut.price}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              setEditingHaircut(haircut);
                              setIsHaircutModalOpen(true);
                            }}
                            className="p-2 text-white/40 hover:text-white transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteHaircut(haircut.id)}
                            className="p-2 text-white/40 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <Scissors className="text-amber-500 w-6 h-6" />
            <span className="text-xl font-bold tracking-tighter uppercase italic">BarberFlow</span>
          </div>
          <div className="flex items-center gap-6 opacity-40">
            <Instagram className="w-5 h-5 hover:text-amber-500 cursor-pointer transition-colors" />
            <Facebook className="w-5 h-5 hover:text-amber-500 cursor-pointer transition-colors" />
          </div>
          <p className="text-xs uppercase tracking-widest opacity-40">© 2026 BarberFlow. Todos os direitos reservados.</p>
        </div>
      </footer>

      {/* Auth Modal (Supabase) */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#1A1A1A] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="p-8 md:p-12">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h3 className="text-3xl font-bold uppercase tracking-tighter mb-2">
                      {authMode === 'login' ? 'Bem-vindo' : 'Criar Conta'}
                    </h3>
                    <p className="text-white/40 text-sm">
                      {authMode === 'login' ? 'Entre com seu e-mail e senha.' : 'Cadastre-se para agendar seus cortes.'}
                    </p>
                  </div>
                  <button onClick={() => setIsAuthModalOpen(false)} className="text-white/20 hover:text-white">
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">E-mail</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                      <input 
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                      <input 
                        required
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isAuthenticating}
                    className="w-full bg-amber-500 text-black py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isAuthenticating ? (
                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <LogIn className="w-5 h-5" />
                    )}
                    {authMode === 'login' ? 'Entrar' : 'Cadastrar'}
                  </button>
                </form>

                <div className="mt-8 pt-8 border-t border-white/5 text-center">
                  <p className="text-sm text-white/40 mb-4">
                    {authMode === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?'}
                  </p>
                  <button 
                    onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                    className="text-amber-500 font-bold uppercase text-xs tracking-widest hover:underline"
                  >
                    {authMode === 'login' ? 'Cadastre-se agora' : 'Faça login'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Haircut Edit Modal */}
      <AnimatePresence>
        {isHaircutModalOpen && editingHaircut && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHaircutModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-[#1A1A1A] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="p-8 md:p-12">
                <h3 className="text-3xl font-bold uppercase tracking-tighter mb-2">
                  {editingHaircut.id ? 'Editar Serviço' : 'Novo Serviço'}
                </h3>
                <p className="text-white/40 text-sm mb-8">Configure os detalhes do serviço oferecido.</p>

                <form onSubmit={handleHaircutSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Nome do Serviço</label>
                    <input 
                      required
                      type="text"
                      value={editingHaircut.name}
                      onChange={(e) => setEditingHaircut({ ...editingHaircut, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Preço (R$)</label>
                      <input 
                        required
                        type="number"
                        value={editingHaircut.price}
                        onChange={(e) => setEditingHaircut({ ...editingHaircut, price: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Duração (min)</label>
                      <input 
                        required
                        type="number"
                        value={editingHaircut.duration}
                        onChange={(e) => setEditingHaircut({ ...editingHaircut, duration: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">URL da Imagem</label>
                    <input 
                      required
                      type="url"
                      value={editingHaircut.image}
                      onChange={(e) => setEditingHaircut({ ...editingHaircut, image: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Descrição</label>
                    <textarea 
                      required
                      value={editingHaircut.description}
                      onChange={(e) => setEditingHaircut({ ...editingHaircut, description: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors h-24 resize-none"
                    />
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-amber-500 text-black py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                    >
                      <Save className="w-5 h-5" /> Salvar Serviço
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isBookingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBookingModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-[#1A1A1A] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="p-8 md:p-12">
                <h3 className="text-3xl font-bold uppercase tracking-tighter mb-2">Agendar Corte</h3>
                <p className="text-white/40 text-sm mb-8">Preencha os dados abaixo para reservar seu horário.</p>

                <form onSubmit={handleBooking} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Seu Nome</label>
                    <input 
                      required
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: Arthur Diniz"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Horário</label>
                      <input 
                        required
                        type="time"
                        value={bookingTime}
                        onChange={(e) => setBookingTime(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors [color-scheme:dark]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Corte</label>
                      <select 
                        value={selectedHaircut?.id}
                        onChange={(e) => setSelectedHaircut(haircuts.find(h => h.id === e.target.value) || null)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors appearance-none"
                      >
                        {haircuts.map(h => (
                          <option key={h.id} value={h.id} className="bg-[#1A1A1A]">{h.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-amber-500 text-black py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
                    >
                      Confirmar Agendamento
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <Analytics />
    </div>
  );
}
