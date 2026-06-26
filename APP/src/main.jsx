import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

const ROOT_ELEMENT_ID = 'root';

class RootErrorBoundary extends React.Component {
  constructor( props ) {
    super( props );

    this.state = {
      hasError: false
    };
  }

  static getDerivedStateFromError() {
    return {
      hasError: true
    };
  }

  componentDidCatch( error, errorInfo ) {
    if ( import.meta.env.DEV ) {
      console.error( '[Contracts CRM] Erro não tratado na árvore React:', error, errorInfo );
    }
  }

  render() {
    if ( this.state.hasError ) {
      return (
        <div className="grid min-h-screen place-items-center bg-slate-50 px-4 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
          <section className="w-full max-w-lg rounded-3xl border border-white/70 bg-white/85 p-8 text-center shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-black/30">
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-red-600/10 text-2xl font-black text-red-600 ring-1 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20">
              !
            </div>

            <h1 className="text-2xl font-black tracking-tight">
              Algo deu errado
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Não foi possível carregar a interface agora. Atualize a página e tente novamente.
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-600/25 active:translate-y-0 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              Recarregar página
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById( ROOT_ELEMENT_ID );

if ( !rootElement ) {
  throw new Error( `Elemento #${ ROOT_ELEMENT_ID } não foi encontrado no index.html.` );
}

createRoot( rootElement ).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);
