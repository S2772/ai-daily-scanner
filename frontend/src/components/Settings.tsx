import React, { useEffect, useState } from 'react';
import {
  Twitter, MessageCircle, Globe, Plus, X,
  Settings2, Bot, Zap, Bell, Mail, Webhook,
  CheckCircle2, AlertCircle, Link2, Link2Off,
  ChevronDown
} from 'lucide-react';
import { fetchSettings, updateSettings } from '../api';

type SchedulerInfo = {
  enabled: boolean;
  hour: number;
  last_run_id: number | null;
  last_triggered_at: string | null;
  next_trigger_at: string | null;
};

export function Settings() {
  const [activeTab, setActiveTab] = useState('sources');

  // Tab 1 Data
  const [platforms, setPlatforms] = useState([
    { id: 'twitter', name: 'Twitter / X', icon: <Twitter className="w-5 h-5 text-blue-400" />, connected: true },
    { id: 'wechat', name: 'WeChat', icon: <MessageCircle className="w-5 h-5 text-green-500" />, connected: true },
    { id: 'reddit', name: 'Reddit', icon: <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold">R</div>, connected: false },
  ]);

  const [rssSources, setRssSources] = useState([
    { id: 'hn', name: 'HackerNews', url: 'news.ycombinator.com', enabled: true },
    { id: 'tc', name: 'TechCrunch', url: 'techcrunch.com', enabled: true },
    { id: 'ph', name: 'ProductHunt', url: 'producthunt.com', enabled: false },
  ]);

  const [newCreator, setNewCreator] = useState('');
  const [creators, setCreators] = useState([
    { id: '1', name: '@elonmusk', platform: 'Twitter' },
    { id: '2', name: '@sama', platform: 'Twitter' },
    { id: '3', name: '晚点LatePost', platform: 'WeChat' },
    { id: '4', name: '机器之心', platform: 'WeChat' },
  ]);

  // Tab 2 Data
  const [llmProvider, setLlmProvider] = useState('claude-3-5-sonnet');
  const [outputLanguage, setOutputLanguage] = useState('zh-CN');
  const [threshold, setThreshold] = useState(80);

  // Tab 3 Data
  const [schedule, setSchedule] = useState('6h');
  const [email, setEmail] = useState('founder@startup.com');
  const [webhook, setWebhook] = useState('https://hooks.slack.com/services/T0000/B0000/XXXX');

  // Daily collect schedule (real backend setting)
  const [dailyCollectEnabled, setDailyCollectEnabled] = useState(true);
  const [dailyCollectHour, setDailyCollectHour] = useState(10);
  const [schedulerInfo, setSchedulerInfo] = useState<SchedulerInfo | null>(null);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((data: any) => {
        if (cancelled) return;
        if (typeof data.daily_collect_enabled === 'boolean') setDailyCollectEnabled(data.daily_collect_enabled);
        if (typeof data.daily_deadline_hour === 'number') setDailyCollectHour(data.daily_deadline_hour);
        if (data.scheduler) setSchedulerInfo(data.scheduler as SchedulerInfo);
      })
      .catch(() => {
        // keep defaults
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveAutomation = async () => {
    setSavingAutomation(true);
    setAutomationMessage(null);
    try {
      const res: any = await updateSettings({ daily_deadline_hour: dailyCollectHour, daily_collect_enabled: dailyCollectEnabled });
      if (res && res.ok) {
        setAutomationMessage('Saved. Schedule takes effect immediately.');
        // refresh scheduler info
        const fresh: any = await fetchSettings();
        if (fresh && fresh.scheduler) setSchedulerInfo(fresh.scheduler as SchedulerInfo);
      } else {
        setAutomationMessage('Save failed.');
      }
    } catch (e: any) {
      setAutomationMessage(`Save failed: ${String(e?.message || e)}`);
    } finally {
      setSavingAutomation(false);
    }
  };

  const handleAddCreator = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCreator.trim()) {
      setCreators([...creators, { id: Date.now().toString(), name: newCreator.trim(), platform: 'Twitter' }]);
      setNewCreator('');
    }
  };

  const handleRemoveCreator = (id: string) => {
    setCreators(creators.filter(c => c.id !== id));
  };

  const togglePlatform = (id: string) => {
    setPlatforms(platforms.map(p => p.id === id ? { ...p, connected: !p.connected } : p));
  };

  const toggleRss = (id: string) => {
    setRssSources(rssSources.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-gray-500 text-xs">Configure your data sources, AI engine, and automation workflows.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('sources')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'sources' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Globe className="w-4 h-4" />
          Data Sources
        </button>
        <button
          onClick={() => setActiveTab('engine')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'engine' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Bot className="w-4 h-4" />
          AI Engine
        </button>
        <button
          onClick={() => setActiveTab('automation')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'automation' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Zap className="w-4 h-4" />
          Automation
        </button>
      </div>

      <div className="flex-1">
        {/* TAB 1: Data Sources */}
        {activeTab === 'sources' && (
          <div className="space-y-8 max-w-4xl">
            {/* Platform Integrations */}
            <section>
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Platform Integrations</h2>
              <div className="flex flex-col gap-3">
                {platforms.map(platform => (
                  <div key={platform.id} className="bg-white border border-[#EAEAEA] rounded-xl p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      {platform.icon}
                      <span className="font-medium text-gray-900 text-sm">{platform.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 ${
                        platform.connected ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {platform.connected ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {platform.connected ? 'Connected' : 'Not Connected'}
                      </div>
                      <button
                        onClick={() => togglePlatform(platform.id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                          platform.connected
                            ? 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                            : 'bg-purple-600 text-white hover:bg-purple-700'
                        }`}
                      >
                        {platform.connected ? (
                          <><Link2Off className="w-3.5 h-3.5" /> Disconnect</>
                        ) : (
                          <><Link2 className="w-3.5 h-3.5" /> Connect</>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: AI Engine */}
        {activeTab === 'engine' && (
          <div className="space-y-8 max-w-4xl">
            <section className="bg-white border border-[#EAEAEA] rounded-xl p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">LLM Provider</label>
                <p className="text-xs text-gray-500 mb-3">Select the primary model used for analysis and opportunity generation.</p>
                <div className="relative">
                  <select 
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value)}
                    className="w-full appearance-none bg-white border border-gray-200 rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Recommended)</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gemini-1-5-pro">Gemini 1.5 Pro</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">Output Language</label>
                <p className="text-xs text-gray-500 mb-3">The language used for generated insights and reports.</p>
                <div className="relative">
                  <select 
                    value={outputLanguage}
                    onChange={(e) => setOutputLanguage(e.target.value)}
                    className="w-full appearance-none bg-white border border-gray-200 rounded-md pl-3 pr-10 py-2 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="zh-CN">Simplified Chinese (简体中文)</option>
                    <option value="en-US">English</option>
                    <option value="ja-JP">Japanese (日本語)</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-gray-900">Opportunity Threshold</label>
                  <span className="text-sm font-bold text-purple-600">{threshold}+</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">Only show generated opportunities with a potential score above this value.</p>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-2 font-medium">
                  <span>0 (All Noise)</span>
                  <span>50 (Balanced)</span>
                  <span>100 (High Signal)</span>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: Automation */}
        {activeTab === 'automation' && (
          <div className="space-y-8 max-w-4xl">
            <section className="bg-white border border-[#EAEAEA] rounded-xl p-6 space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-1">Daily Collection</label>
                    <p className="text-xs text-gray-500">Run daily data collection automatically at a fixed hour.</p>
                  </div>
                  {schedulerInfo?.next_trigger_at && (
                    <div className="text-right">
                      <div className="text-[11px] text-gray-500">Next trigger</div>
                      <div className="text-xs font-medium text-gray-900">{schedulerInfo.next_trigger_at}</div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <div>
                    <div className="text-[11px] text-gray-500">Enabled</div>
                    <div className="text-xs font-medium text-gray-900">{dailyCollectEnabled ? 'Yes' : 'No'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500">Last trigger</div>
                    <div className="text-xs font-medium text-gray-900">{schedulerInfo?.last_triggered_at || '-'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500">Last run id</div>
                    <div className="text-xs font-medium text-gray-900">{schedulerInfo?.last_run_id ?? '-'}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-gray-900">Enable daily collect</div>
                  <div className="text-xs text-gray-500">When enabled, a collect run will start every day.</div>
                </div>
                <button
                    type="button"
                    onClick={() => setDailyCollectEnabled(!dailyCollectEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      dailyCollectEnabled ? 'bg-purple-600' : 'bg-gray-300'
                    }`}
                    aria-pressed={dailyCollectEnabled}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        dailyCollectEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Daily trigger hour (0-23)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={dailyCollectHour}
                    onChange={(e) => setDailyCollectHour(Math.max(0, Math.min(23, Number(e.target.value))))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                  <div className="text-[11px] text-gray-500 mt-2">Example: 10 means 10:00 every day (local time).</div>
                </div>

              {automationMessage && (
                <div className="mt-3 text-xs text-gray-600">{automationMessage}</div>
              )}

              <div className="pt-6 border-t border-gray-100">
                <label className="block text-sm font-semibold text-gray-900 mb-1.5">Delivery Notifications</label>
                <p className="text-xs text-gray-500 mb-4">Where should we send the generated opportunity summaries?</p>
                
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1.5">
                      <Mail className="w-3.5 h-3.5" /> Email Summary
                    </label>
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email address"
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-1.5">
                      <Webhook className="w-3.5 h-3.5" /> Webhook URL (Slack / DingTalk)
                    </label>
                    <input 
                      type="url" 
                      value={webhook}
                      onChange={(e) => setWebhook(e.target.value)}
                      placeholder="https://"
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <div className="text-[11px] text-gray-500">Only daily collect is wired to backend for now.</div>
                <button
                  onClick={saveAutomation}
                  disabled={savingAutomation}
                  className={`px-4 py-2 text-white text-sm font-medium rounded-md shadow-sm ${
                    savingAutomation ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {savingAutomation ? 'Saving...' : 'Save Daily Schedule'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
