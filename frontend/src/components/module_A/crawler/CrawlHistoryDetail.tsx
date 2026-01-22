import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiService } from '../../../services/api/api';

export const CrawlHistoryDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [sessionData, setSessionData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSessionData = async () => {
            if (!id) {
                setError('No session ID provided');
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const data = await apiService.getSessionData(parseInt(id));
                setSessionData(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load session data');
            } finally {
                setLoading(false);
            }
        };

        fetchSessionData();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Loading session data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    <p className="font-bold">Error</p>
                    <p>{error}</p>
                </div>
                <button
                    onClick={() => navigate('/history')}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    Back to History
                </button>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-4">
                <button
                    onClick={() => navigate('/history')}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                    ← Back to History
                </button>
            </div>

            <div className="bg-white shadow-md rounded-lg p-6">
                <h1 className="text-2xl font-bold mb-4">Crawl Session #{id}</h1>

                {sessionData?.session && (
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold mb-2">Session Info</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-gray-600">URL:</p>
                                <p className="font-medium">{sessionData.session.start_url || sessionData.session.url}</p>
                            </div>
                            <div>
                                <p className="text-gray-600">Status:</p>
                                <p className="font-medium capitalize">{sessionData.session.status}</p>
                            </div>
                            <div>
                                <p className="text-gray-600">Total Pages:</p>
                                <p className="font-medium">{sessionData.totalPages || 0}</p>
                            </div>
                            <div>
                                <p className="text-gray-600">Total Resources:</p>
                                <p className="font-medium">{sessionData.totalResources || 0}</p>
                            </div>
                        </div>
                    </div>
                )}

                {sessionData?.data && sessionData.data.length > 0 && (
                    <div>
                        <h2 className="text-xl font-semibold mb-2">Pages Crawled</h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full bg-white border">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="px-4 py-2 border">URL</th>
                                        <th className="px-4 py-2 border">Status</th>
                                        <th className="px-4 py-2 border">Title</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessionData.data.slice(0, 50).map((page: any, index: number) => (
                                        <tr key={index} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 border text-sm">{page.url}</td>
                                            <td className="px-4 py-2 border text-center">{page.status_code}</td>
                                            <td className="px-4 py-2 border text-sm">{page.title || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {sessionData.data.length > 50 && (
                                <p className="text-sm text-gray-600 mt-2">
                                    Showing 50 of {sessionData.data.length} pages
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CrawlHistoryDetail;
