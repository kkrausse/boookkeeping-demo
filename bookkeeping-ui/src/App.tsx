import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import './App.css'
import { TransactionsPage } from './pages/TransactionsPage'
import { RulesPage } from './pages/RulesPage'
import { Navbar } from './components/Navbar'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Disable automatic refetching when window regains focus
    },
  },
})

function App() {
  const [activePage, setActivePage] = useState<string>('transactions');

  const handlePageChange = (page: string) => {
    setActivePage(page);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
      <div className="app-container">
        <Navbar activePage={activePage} onPageChange={handlePageChange} />
        <div className="page-content">
          {activePage === 'transactions' && <TransactionsPage />}
          {activePage === 'rules' && <RulesPage />}
        </div>
      </div>
      {/* Add the ReactQueryDevtools - it will appear as a floating panel */}
    </QueryClientProvider>
  );
}

export default App
