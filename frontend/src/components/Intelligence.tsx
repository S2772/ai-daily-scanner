import React, { useState } from 'react';
import { mockReports, mockOpportunities, mockNews } from '../data/mockData';
import { FileText, Calendar, ArrowLeft, Download, Share2, Trash2, Link as LinkIcon } from 'lucide-react';
import { IntelligenceReport } from '../types';

export function Intelligence() {
  const [selectedReport, setSelectedReport] = useState<IntelligenceReport | null>(null);

  if (selectedReport) {
    const sourceOpp = selectedReport.sourceOpportunityId ? mockOpportunities.find(o => o.id === selectedReport.sourceOpportunityId) : null;
    const sourceNews = selectedReport.sourceNewsId ? mockNews.find(n => n.id === selectedReport.sourceNewsId) : null;

    return (
      <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2 animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => setSelectedReport(null)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Reports
          </button>
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
              <Share2 className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="bg-white border border-[#EAEAEA] rounded-lg p-8 max-w-3xl mx-auto w-full">
          <div className="mb-8 pb-6 border-b border-gray-100">
            <h1 className="text-2xl font-semibold text-gray-900 mb-3">{selectedReport.title}</h1>
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(selectedReport.createdAt).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                User Note
              </span>
            </div>

            {(sourceOpp || sourceNews) && (
              <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-md border border-gray-100">
                <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" /> Sources
                </span>
                {sourceOpp && (
                  <div className="text-xs text-gray-600 flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">Opportunity</span>
                    <span className="truncate">{sourceOpp.title}</span>
                  </div>
                )}
                {sourceNews && (
                  <div className="text-xs text-gray-600 flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">News</span>
                    <span className="truncate">{sourceNews.title}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="prose prose-sm prose-purple max-w-none text-gray-700 whitespace-pre-line leading-relaxed">
            {selectedReport.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8 pr-2">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Intelligence</h1>
        <p className="text-gray-500 text-xs">Your personal knowledge base of AI-generated reports and deep dives.</p>
      </div>

      {mockReports.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50 border border-dashed border-gray-200 rounded-lg">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 mb-4">
            <FileText className="w-5 h-5 text-gray-400" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No reports yet</h3>
          <p className="text-xs text-gray-500 max-w-sm">
            Generate reports from the Opportunity page to save them here for deeper analysis.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockReports.map(report => (
            <div 
              key={report.id}
              onClick={() => setSelectedReport(report)}
              className="bg-white border border-[#EAEAEA] rounded-lg p-5 hover:border-purple-500/30 hover:shadow-sm transition-all cursor-pointer group flex flex-col h-48"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded bg-purple-50 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
              </div>
              
              <h3 className="text-sm font-semibold text-gray-900 mb-2 group-hover:text-purple-700 transition-colors line-clamp-2">
                {report.title}
              </h3>
              
              <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed flex-1">
                {report.content.substring(0, 150)}...
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
