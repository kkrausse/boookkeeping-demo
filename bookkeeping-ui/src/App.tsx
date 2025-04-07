import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import axios from 'axios'
import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import './App.css'
import { TransactionTable, TransactionTableProps } from './components/TransactionTable';
import { Transaction, fetchTransactions, deleteTransaction, uploadCSV, TRANSACTION_KEYS } from './api/transactions';


const queryClient = new QueryClient()

function CsvUpload() {
  const { mutate: fileMutate } = useMutation<void, Error, File>({
    mutationFn: uploadCSV,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: TRANSACTION_KEYS.all});
    },
    onError: (err) => {
      console.error('Delete failed:', err);
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      fileMutate(event.target.files[0])
    }
  }


  return (
    <input type="file" accept=".csv" onChange={handleFileChange} />
  )
}

function TransactionsPage() {
  const queryClient = useQueryClient();

  // Fetch transactions
  const { data, isLoading, error } = useQuery<Transaction[], Error>({
    queryKey: TRANSACTION_KEYS.all,
    queryFn: () => fetchTransactions().then(r => r.data),
  });


  // Delete mutation
  const { mutate: deleteMutate } = useMutation<void, Error, { transaction_id: number }>({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: TRANSACTION_KEYS.all});
    },
    onError: (err) => {
      console.error('Delete failed:', err);
    },
  });


  if (isLoading) return <div>Loading transactions...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const transactions: Transaction[] = data || [];
  return (
    <>
      <CsvUpload />
      <TransactionTable tableProps={({
        transactions: transactions,
        currentSort: { column: 'datetime', order: 'desc' },
        onChangeSort: (x) => console.log('sorting', x),
        onPageForward: (x) => console.log(x),
        onPageBack: (x) => console.log(x),
        currentPage: 0,
        hasNextPage: true,
        onEdit: (x) => console.log(x),
        onDelete: (x) => console.log(x),

      })}/>
      </>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TransactionsPage />
    </QueryClientProvider>
  );
}

export default App
