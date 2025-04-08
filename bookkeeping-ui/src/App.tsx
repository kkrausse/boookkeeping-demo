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
import { 
  Transaction, 
  fetchTransactions, 
  deleteTransaction, 
  uploadCSV, 
  TRANSACTION_KEYS,
  TransactionSort,
  PaginatedResponse,
  FetchTransactionsParams
} from './api/transactions';


const queryClient = new QueryClient()

function CsvUpload() {
  const queryClient = useQueryClient();
  
  const { mutate: fileMutate } = useMutation<void, Error, File>({
    mutationFn: uploadCSV,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['transactions']});
    },
    onError: (err) => {
      console.error('Upload failed:', err);
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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [currentSort, setCurrentSort] = useState<TransactionSort>({ column: 'datetime', order: 'desc' });
  const pageSize = 10; // Match the default in the backend

  // Create query parameters object
  const queryParams: FetchTransactionsParams = {
    page: currentPage,
    pageSize: pageSize,
    sort: currentSort
  };

  // Fetch transactions with pagination
  const { data, isLoading, error } = useQuery<PaginatedResponse<Transaction>, Error>({
    queryKey: TRANSACTION_KEYS.paginated(queryParams),
    queryFn: () => fetchTransactions(queryParams).then(r => r.data),
    placeholderData: keepPreviousData
  });

  // Delete mutation
  const { mutate: deleteMutate } = useMutation<void, Error, { transaction_id: number }>({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['transactions']});
    },
    onError: (err) => {
      console.error('Delete failed:', err);
    },
  });

  // Handle pagination
  const handlePageForward = () => {
    if (data?.next) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePageBack = () => {
    if (data?.previous && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  // Handle sorting
  const handleSortChange = (column: TransactionSortColumn) => {
    setCurrentSort(prev => {
      if (prev.column === column) {
        // Toggle order if same column
        return {
          column,
          order: prev.order === 'asc' ? 'desc' : 'asc'
        };
      } else {
        // Default to descending order for new column
        return {
          column,
          order: 'desc'
        };
      }
    });
    // Reset to first page when sorting changes
    setCurrentPage(1);
  };

  if (isLoading && !data) return <div>Loading transactions...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const transactions: Transaction[] = data?.results || [];
  const totalCount = data?.count || 0;
  const hasNextPage = !!data?.next;
  const hasPreviousPage = !!data?.previous;

  return (
    <>
      <CsvUpload />
      <div className="transactions-header">
        <h2>Transactions</h2>
        <div className="transactions-info">Total: {totalCount}</div>
      </div>
      <TransactionTable tableProps={({
        transactions: transactions,
        currentSort: currentSort,
        onChangeSort: handleSortChange,
        onPageForward: handlePageForward,
        onPageBack: handlePageBack,
        currentPage: currentPage,
        hasNextPage: hasNextPage,
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
