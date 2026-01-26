import React, { useState, useEffect } from 'react';
import {
    useGetSchedulesQuery,
    useGetScheduleStatsQuery,
    useToggleScheduleMutation,
    useTriggerScheduleMutation,
    useDeleteScheduleMutation,
    type Schedule as ApiSchedule,
} from '../../../store/api/module_D/schedulerApi';
import './ScheduleList.css';
import ScheduleForm from './ScheduleForm';

// Extended Schedule interface for UI with additional fields
interface Schedule extends ApiSchedule {
    description?: string;
    startUrl?: string;
    allowSubdomains?: boolean;
    maxConcurrency?: number;
    mode?: string;
    lastRun?: string;
    nextRun?: string;
    totalRuns?: number;
    successfulRuns?: number;
    failedRuns?: number;
}

interface ScheduleStats {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    successRate: number;
    averageDuration: number;
    lastRun?: string;
    nextRun?: string;
}

const ScheduleList: React.FC = () => {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
    const [stats, setStats] = useState<ScheduleStats | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

    // RTK Query hooks
    const { data: schedulesData, isLoading: isLoadingSchedules, refetch: refetchSchedules } = useGetSchedulesQuery();
    const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
    const { data: scheduleStatsData } = useGetScheduleStatsQuery(selectedScheduleId!, {
        skip: !selectedScheduleId,
    });
    const [toggleScheduleMutation] = useToggleScheduleMutation();
    const [triggerScheduleMutation] = useTriggerScheduleMutation();
    const [deleteScheduleMutation] = useDeleteScheduleMutation();

    useEffect(() => {
        if (schedulesData) {
            // Map API schedules to extended Schedule type
            setSchedules(schedulesData as Schedule[]);
            setLoading(false);
        } else if (isLoadingSchedules) {
            setLoading(true);
        }
    }, [schedulesData, isLoadingSchedules]);

    useEffect(() => {
        if (scheduleStatsData) {
            setStats({
                ...scheduleStatsData,
                successRate: scheduleStatsData.totalRuns > 0 
                    ? (scheduleStatsData.successfulRuns / scheduleStatsData.totalRuns) * 100 
                    : 0,
                averageDuration: 0, // API doesn't provide this, set to 0
            });
        }
    }, [scheduleStatsData]);

    const toggleSchedule = async (scheduleId: number) => {
        try {
            await toggleScheduleMutation(scheduleId).unwrap();
            await refetchSchedules();
        } catch (err: any) {
            setError(err?.data?.error || err?.message || 'Failed to toggle schedule');
        }
    };

    const triggerSchedule = async (scheduleId: number) => {
        try {
            await triggerScheduleMutation(scheduleId).unwrap();
            alert('Schedule triggered successfully!');
        } catch (err: any) {
            setError(err?.data?.error || err?.message || 'Failed to trigger schedule');
        }
    };

    const deleteSchedule = async (scheduleId: number) => {
        if (!confirm('Are you sure you want to delete this schedule?')) {
            return;
        }
        
        try {
            await deleteScheduleMutation(scheduleId).unwrap();
            await refetchSchedules();
        } catch (err: any) {
            setError(err?.data?.error || err?.message || 'Failed to delete schedule');
        }
    };

    const handleScheduleClick = (schedule: Schedule) => {
        setSelectedSchedule(schedule);
        setSelectedScheduleId(schedule.id);
    };

    const handleEdit = (schedule: Schedule) => {
        setEditingSchedule(schedule);
        setShowForm(true);
    };

    const handleFormClose = () => {
        setShowForm(false);
        setEditingSchedule(null);
        refetchSchedules();
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    const getCronDescription = (cronExpression: string) => {
        const descriptions: { [key: string]: string } = {
            '0 9 * * *': 'Daily at 9:00 AM',
            '0 0 * * 0': 'Weekly on Sunday',
            '0 0 1 * *': 'Monthly on 1st',
            '*/15 * * * *': 'Every 15 minutes',
            '0 */6 * * *': 'Every 6 hours',
            '0 9 * * 1-5': 'Weekdays at 9 AM'
        };
        return descriptions[cronExpression] || `Custom: ${cronExpression}`;
    };

    if (loading) {
        return <div className="schedule-list loading">Loading schedules...</div>;
    }

    return (
        <div className="schedule-list">
            <div className="schedule-header">
                <h2>Scheduled Crawls</h2>
            </div>

            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}

            <div className="schedule-content-wrapper">
                {/* Left side - Schedule List */}
                <div className="schedule-list-section">
                    <div className="schedule-grid">
                {schedules.map((schedule) => (
                    <div 
                        key={schedule.id} 
                        className={`schedule-card ${schedule.enabled ? 'enabled' : 'disabled'}`}
                        onClick={() => handleScheduleClick(schedule)}
                    >
                        <div className="schedule-header">
                            <h3>{schedule.name}</h3>
                            <div className="schedule-status">
                                <span className={`status-indicator ${schedule.enabled ? 'active' : 'inactive'}`}>
                                    {schedule.enabled ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>
                        
                        <div className="schedule-info">
                            {schedule.description && <p className="description">{schedule.description}</p>}
                            <p className="url">URL: {schedule.startUrl || schedule.url}</p>
                            <p className="cron">Schedule: {getCronDescription(schedule.cronExpression)}</p>
                        </div>

                        {(schedule.totalRuns !== undefined || schedule.successfulRuns !== undefined || schedule.failedRuns !== undefined) && (
                            <div className="schedule-stats">
                                {schedule.totalRuns !== undefined && (
                                    <div className="stat">
                                        <span className="label">Runs:</span>
                                        <span className="value">{schedule.totalRuns}</span>
                                    </div>
                                )}
                                {schedule.successfulRuns !== undefined && (
                                    <div className="stat">
                                        <span className="label">Success:</span>
                                        <span className="value success">{schedule.successfulRuns}</span>
                                    </div>
                                )}
                                {schedule.failedRuns !== undefined && (
                                    <div className="stat">
                                        <span className="label">Failed:</span>
                                        <span className="value error">{schedule.failedRuns}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="schedule-actions">
                            <button 
                                className="btn btn-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSchedule(schedule.id);
                                }}
                            >
                                {schedule.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button 
                                className="btn btn-sm btn-secondary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    triggerSchedule(schedule.id);
                                }}
                            >
                                Run Now
                            </button>
                            <button 
                                className="btn btn-sm btn-secondary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(schedule);
                                }}
                            >
                                Edit
                            </button>
                            <button 
                                className="btn btn-sm btn-danger"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSchedule(schedule.id);
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
                    </div>

                    {selectedSchedule && (
                        <div className="schedule-details">
                            <h3>Schedule Details: {selectedSchedule.name}</h3>
                            {stats && (
                                <div className="stats-grid">
                                    <div className="stat-card">
                                        <h4>Success Rate</h4>
                                        <div className="stat-value">{stats.successRate.toFixed(1)}%</div>
                                    </div>
                                    <div className="stat-card">
                                        <h4>Average Duration</h4>
                                        <div className="stat-value">{Math.round(stats.averageDuration / 1000)}s</div>
                                    </div>
                                    <div className="stat-card">
                                        <h4>Last Run</h4>
                                        <div className="stat-value">
                                            {stats.lastRun ? formatDate(stats.lastRun) : 'Never'}
                                        </div>
                                    </div>
                                    <div className="stat-card">
                                        <h4>Next Run</h4>
                                        <div className="stat-value">
                                            {stats.nextRun ? formatDate(stats.nextRun) : 'Not scheduled'}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right side - Schedule Form (Always visible) */}
                <div className="schedule-form-section">
                    <ScheduleForm 
                        schedule={editingSchedule as any}
                        onClose={handleFormClose}
                    />
                </div>
            </div>
        </div>
    );
};

export default ScheduleList;
