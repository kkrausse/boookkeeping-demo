import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './App.css'
import './styles/RulesPage.css'
import { TransactionsPage } from './pages/TransactionsPage'
import { RulesPage } from './pages/RulesPage'
import { Navbar } from './components/Navbar'

const queryClient = new QueryClient()

function App() {
  const [activePage, setActivePage] = useState<string>('transactions');

  const handlePageChange = (page: string) => {
    setActivePage(page);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-container">
        <Navbar activePage={activePage} onPageChange={handlePageChange} />
        <div className="page-content">
          {activePage === 'transactions' && <TransactionsPage />}
          {activePage === 'rules' && <RulesPage />}
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App