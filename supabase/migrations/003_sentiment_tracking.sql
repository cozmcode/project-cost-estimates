-- Migration: Sentiment Tracking for Voice Chat
-- Purpose: Store sentiment scores from voice conversations for policy review analysis

-- Create sentiment_logs table
CREATE TABLE IF NOT EXISTS sentiment_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- User context
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,  -- Groups messages from same conversation

    -- Message content
    message_text TEXT NOT NULL,
    message_type TEXT DEFAULT 'user',  -- 'user' or 'assistant'

    -- Sentiment analysis
    sentiment_score INTEGER NOT NULL CHECK (sentiment_score >= -100 AND sentiment_score <= 100),
    topic TEXT NOT NULL,  -- tax, social_security, per_diem, admin_fees, salary, duration, general, etc.
    keywords TEXT[],  -- Array of sentiment keywords detected

    -- Calculation context (what was being discussed)
    home_country TEXT,
    host_country TEXT,
    assignment_months INTEGER,
    monthly_salary DECIMAL(12,2),

    -- Metadata
    calculation_total DECIMAL(12,2),  -- The estimate total at time of message
    page_section TEXT  -- Which section user was viewing (calculator, analytics, staffing)
);

-- Create indexes for efficient querying
CREATE INDEX idx_sentiment_created_at ON sentiment_logs(created_at DESC);
CREATE INDEX idx_sentiment_session ON sentiment_logs(session_id);
CREATE INDEX idx_sentiment_topic ON sentiment_logs(topic);
CREATE INDEX idx_sentiment_score ON sentiment_logs(sentiment_score);
CREATE INDEX idx_sentiment_host_country ON sentiment_logs(host_country);

-- Enable RLS
ALTER TABLE sentiment_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own sentiment logs
CREATE POLICY "Users can insert own sentiment logs"
    ON sentiment_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can read their own sentiment logs
CREATE POLICY "Users can read own sentiment logs"
    ON sentiment_logs
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy: Superusers can read all sentiment logs (for analysis)
CREATE POLICY "Superusers can read all sentiment logs"
    ON sentiment_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE app_users.id = auth.uid()
            AND app_users.role = 'superuser'
        )
    );

-- Create a view for aggregated sentiment analysis by topic
CREATE OR REPLACE VIEW sentiment_summary AS
SELECT
    topic,
    host_country,
    COUNT(*) as message_count,
    ROUND(AVG(sentiment_score), 1) as avg_sentiment,
    MIN(sentiment_score) as min_sentiment,
    MAX(sentiment_score) as max_sentiment,
    COUNT(*) FILTER (WHERE sentiment_score < -30) as negative_count,
    COUNT(*) FILTER (WHERE sentiment_score BETWEEN -30 AND 30) as neutral_count,
    COUNT(*) FILTER (WHERE sentiment_score > 30) as positive_count
FROM sentiment_logs
GROUP BY topic, host_country;

-- Grant access to the view
GRANT SELECT ON sentiment_summary TO authenticated;

COMMENT ON TABLE sentiment_logs IS 'Stores sentiment scores from voice chat conversations for policy review analysis';
COMMENT ON COLUMN sentiment_logs.sentiment_score IS 'Score from -100 (very negative) to +100 (very positive), 0 is neutral';
COMMENT ON COLUMN sentiment_logs.topic IS 'Categorized topic: tax, social_security, per_diem, admin_fees, salary, duration, general, positive_feedback, negative_feedback, question, confusion';
