<?php
/**
 * Recorded WordPress audit hook calls.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

/** Captured hook names and payloads. */
final class BlixisAuditHookState {
	/** Recorded hook names and payloads.
	 *
	 * @var list<array{string,array<string,mixed>}>
	 */
	public static array $events = [];

	/** Return events recorded by the global hook stub.
	 *
	 * @return list<array{string,array<string,mixed>}>
	 */
	public static function all(): array {
		return self::$events;
	}
}
