import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import PageHero from '@/components/shared/PageHero'
import Breadcrumbs from '@/components/seo/Breadcrumbs'

interface Video {
  title: string
  videoId: string
  description: string
}

const videos: Video[] = [
  {
    title: 'Welcome to MyGlue',
    videoId: 'k5UMYdyr7ZU',
    description: 'Get started with MyGlue and learn the basics of this powerful password and documentation management platform.'
  },
  {
    title: 'Simple Documentation in MyGlue',
    videoId: 'rsgqa26cX5w',
    description: 'Learn how to create and organize documentation in MyGlue for easy access to important information.'
  },
  {
    title: 'MyGlue Chrome Extension and Mobile App',
    videoId: 'DHMpUMGIyZI',
    description: 'Discover how to use MyGlue on the go with the Chrome extension and mobile app for seamless access anywhere.'
  },
  {
    title: 'MyGlue Quick Summary',
    videoId: '8f1mfDZCgXE',
    description: 'A quick overview of MyGlue features and capabilities to help you get up to speed fast.'
  },
  {
    title: 'Maximizing Productivity with MyGlue',
    videoId: 'mvYqeXU6oWg',
    description: 'Tips and tricks to maximize your productivity using MyGlue\'s powerful features and workflows.'
  },
  {
    title: 'Managing Passwords with MyGlue',
    videoId: '_ZsLQMYxotI',
    description: 'Learn best practices for storing, organizing, and managing passwords securely with MyGlue.'
  },
  {
    title: 'Managing Security with MyGlue',
    videoId: '347RCcDO2eM',
    description: 'Understand how MyGlue keeps your sensitive information secure with enterprise-grade security features.'
  },
  {
    title: 'MyGlue in Action',
    videoId: 'Hk5XPgJk6yo',
    description: 'See MyGlue in real-world scenarios and learn how it can streamline your daily workflows.'
  }
]

export default function MyGlue() {
  return (
    <main>
      <Header />
      <Breadcrumbs />

      <PageHero
        title="Getting Started with MyGlue"
        subtitle="Your secure password manager and documentation hub"
        textAlign="center"
        verticalPosition="center"
        imageBackground="/herobg.webp"
        showGradientTransition={false}
        titleClassName="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
      />

      {/* Introduction Section */}
      <div className="relative bg-gradient-to-br from-black via-gray-900 to-purple-900 py-16 -mt-8 md:-mt-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 md:p-12 shadow-xl">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Welcome to MyGlue</h2>
            <p className="text-lg text-white/90 mb-6">
              MyGlue is your secure, centralized platform for password management and documentation.
              As a Triple Cities Tech client, you have access to this powerful tool that helps you
              stay organized, secure, and productive.
            </p>
            <p className="text-lg text-white/90">
              Watch the videos below to learn how to make the most of MyGlue's features and capabilities.
            </p>
          </div>
        </div>
      </div>

      {/* Videos Section */}
      <div className="relative bg-gradient-to-br from-gray-900 via-black to-purple-900 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Video Tutorials</h2>
            <p className="text-xl text-white/90">Watch these short videos to get started with MyGlue</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {videos.map((video, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl overflow-hidden shadow-xl hover:border-purple-400/50 transition-all duration-300">
                {/* Video Embed */}
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    className="absolute top-0 left-0 w-full h-full"
                    src={`https://www.youtube.com/embed/${video.videoId}`}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                {/* Video Info */}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-white mb-3">{video.title}</h3>
                  <p className="text-white/80 text-base">{video.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="relative bg-gradient-to-br from-purple-900 via-gray-900 to-black py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl p-8 md:p-12 shadow-xl text-center">
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">Need Help?</h3>
            <p className="text-lg text-white/90 mb-8">
              If you have questions about MyGlue or need assistance getting set up, our support team is here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="/contact"
                className="inline-flex items-center justify-center bg-white hover:bg-gray-100 text-purple-700 font-bold px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg"
              >
                Contact Support
              </a>
              <a
                href="https://support.myglue.com/hc/en-us"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center bg-white/10 hover:bg-white/20 border-2 border-white text-white font-bold px-8 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg text-lg"
              >
                MyGlue Help Center
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  )
}
