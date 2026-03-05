import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Overview } from './components/Overview';
import { NewsFeed } from './components/NewsFeed';
import { OpportunityDiscovery } from './components/OpportunityDiscovery';
import { Intelligence } from './components/Intelligence';
import { Log } from './components/Log';
import { Settings } from './components/Settings';
import { Saved } from './components/Saved';
import { Sources } from './components/Sources';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);

  const navigateToFeed = (hotspotId?: string) => {
    setActiveTab('feed');
    setSelectedHotspotId(hotspotId || null);
  };

  const navigateToDiscover = (oppId?: string) => {
    setActiveTab('discover');
    setSelectedOppId(oppId || null);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview setActiveTab={setActiveTab} onSelectHotspot={navigateToFeed} onSelectOpp={navigateToDiscover} />;
      case 'feed':
        return <NewsFeed selectedHotspotId={selectedHotspotId} onClearSelection={() => setSelectedHotspotId(null)} />;
      case 'discover':
        return <OpportunityDiscovery setActiveTab={setActiveTab} onSelectHotspot={navigateToFeed} selectedOppId={selectedOppId} onClearSelection={() => setSelectedOppId(null)} />;
      case 'saved':
        return <Saved />;
      case 'notes':
        return <Intelligence />;
      case 'sources':
        return <Sources />;
      case 'log':
        return <Log />;
      case 'settings':
        return <Settings />;
      default:
        return <Overview setActiveTab={setActiveTab} onSelectHotspot={navigateToFeed} onSelectOpp={navigateToDiscover} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111111] font-sans flex">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 ml-64 h-screen overflow-hidden p-8">
        <div className="max-w-6xl mx-auto h-full flex flex-col min-h-0">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
