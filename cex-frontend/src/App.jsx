import { Route, Routes } from 'react-router-dom'
import './App.css'
import LandingPage from './pages/landingPage'
import TradePage from './pages/tradePage'
import LoginPage from './pages/loginPage'
import SignupPage from './pages/signupPage'

function App() {
  return (
    <>
   <Routes>
  <Route path="/" element={<LandingPage />} />
      <Route path="/signin" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
  <Route path="/trade" element={<TradePage />} />
</Routes>
    </>
  )
}

export default App
