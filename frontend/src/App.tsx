import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Eagerly load Login and Unsubscribe — they're the entry points, no benefit from lazy loading
import Login from './pages/Login';
import Unsubscribe from './pages/Unsubscribe';

// Lazy-load all authenticated pages so the initial bundle stays small
const Dashboard     = lazy(() => import('./pages/Dashboard'));
const UploadExcel   = lazy(() => import('./pages/UploadExcel'));
const UploadDetails = lazy(() => import('./pages/UploadDetails'));
const Templates     = lazy(() => import('./pages/Templates'));
const CreateTemplate = lazy(() => import('./pages/CreateTemplate'));
const DeliveryLogs  = lazy(() => import('./pages/DeliveryLogs'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/unsubscribe/:token" element={<Unsubscribe />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          path="/dashboard"
          element={<Suspense fallback={<PageLoader />}><Dashboard /></Suspense>}
        />
        <Route
          path="/uploads"
          element={<Suspense fallback={<PageLoader />}><UploadExcel /></Suspense>}
        />
        <Route
          path="/uploads/:id"
          element={<Suspense fallback={<PageLoader />}><UploadDetails /></Suspense>}
        />
        <Route
          path="/delivery-logs"
          element={<Suspense fallback={<PageLoader />}><DeliveryLogs /></Suspense>}
        />
        <Route
          path="/templates"
          element={<Suspense fallback={<PageLoader />}><Templates /></Suspense>}
        />
        <Route
          path="/templates/create"
          element={<Suspense fallback={<PageLoader />}><CreateTemplate /></Suspense>}
        />
        <Route
          path="/templates/:id/edit"
          element={<Suspense fallback={<PageLoader />}><CreateTemplate /></Suspense>}
        />
      </Route>


      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
