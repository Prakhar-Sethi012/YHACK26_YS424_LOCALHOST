
import SceneManager from './visualizer/SceneManager';
import HeaderBar from './components/HeaderBar';

function App() {
  return (
    <div className="w-screen h-screen bg-black text-white flex flex-col overflow-hidden font-mono">
      <HeaderBar />
      <div className="flex-1 relative">
        <SceneManager />
      </div>
    </div>
  );
}

export default App;
