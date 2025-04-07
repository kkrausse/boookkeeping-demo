import axios from 'axios';

const api = axios.create({
  baseURL: '/api', //import.meta.env.VITE_API_URL, // Loaded from .env
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function uploadCSV(file: File): Promise<any> {
  // Create FormData object to handle file upload
  const formData = new FormData();
  formData.append('file', file);
  // Make the POST request with form data
  const response = await api.post('/transactions/upload/', formData, {
    headers: {
      // Override default Content-Type to handle multipart/form-data
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
}

export const deleteTransaction = async (args: {transaction_id: number}) => {
  console.log('to delete!', args);
  await new Promise((r) => setTimeout(r, 1000));
};

export async function fetchTransactions(): Promise<{ data: Transaction[] }> {
  let r = await api.get('/transactions/');
  return r
}

export const TRANSACTION_KEYS = {
  all: ['all-transactions']
}


export interface Transaction {
  id: number;
  description: string;
  category: string;
  amount: string; // Django DecimalField returns string in JSON
  datetime: string;
  created_at: string;
  updated_at: string;
  flags: TransactionFlag[];
}

export interface TransactionFlag {
  flag_type: string;
  message: string;
  duplicates_transaction: number | null;
}

export type TransactionSortColumn = 'description' | 'amount' | 'datetime' | 'created_at' | 'updated_at';

export interface TransactionSort {
  column: SortColumn
  order: 'asc' | 'desc'
}

export interface QueryRule {
  description_words: string[],
  quantity_value?: number,
  quantity_compare?: '<' | '>' | '=',
}
