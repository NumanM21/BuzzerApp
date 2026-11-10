using System.Threading.Channels;
using BuzzerApp.Core.Rounds;

namespace BuzzerApp.Api.Realtime;

/// <summary>A unit of round data to save, in the order the round produced it.</summary>
public abstract record RoundPersistenceWork;

/// <summary>Insert the round and its buzzes. Core's records don't know the event, so it travels alongside.</summary>
public sealed record LockedRoundWork(int EventId, LockedRoundRecord Record) : RoundPersistenceWork;

/// <summary>Set the round's end time and each queued team's outcome.</summary>
public sealed record EndedRoundWork(EndedRoundRecord Record) : RoundPersistenceWork;

/// <summary>
/// Hands round records from the game (which must never wait on the database) to the single
/// <see cref="RoundPersistenceWorker"/>. One reader keeps them in order, so a round's "ended" update can't
/// run before its "locked" insert.
/// </summary>
public sealed class RoundPersistenceQueue
{
    // Unbounded: a few records per round, and TryWrite then never fails or blocks the caller.
    private readonly Channel<RoundPersistenceWork> _channel =
        Channel.CreateUnbounded<RoundPersistenceWork>(new UnboundedChannelOptions { SingleReader = true });

    public ChannelReader<RoundPersistenceWork> Reader => _channel.Reader;

    public void Enqueue(RoundPersistenceWork work)
    {
        if (!_channel.Writer.TryWrite(work))
        {
            // Only possible once the writer is completed, which nothing does; fail loudly rather than drop stats silently.
            throw new InvalidOperationException("The round persistence queue is closed.");
        }
    }
}
