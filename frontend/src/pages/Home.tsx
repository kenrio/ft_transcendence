import { Link } from 'react-router-dom'

function Home() {
  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <a className="btn btn-ghost text-xl">🎨 おえかきの森</a>
        </div>
      </div>
      
      <div className="hero min-h-[80vh]">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-5xl font-bold">おえかきの森へようこそ！</h1>
            <p className="py-6">友達と一緒にお絵かきで遊ぼう</p>
            <Link to="/game" className="btn btn-primary btn-lg">
              ゲームを始める
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
