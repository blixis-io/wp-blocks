<?php
/**
 * Who saved and when, for revision history rows.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** A seam so the revision ring is testable without WordPress. */
interface RevisionContext {
	/**
	 * The acting user, 0 when unknown.
	 *
	 * @return int
	 */
	public function user_id(): int;

	/**
	 * The current time as UTC RFC 3339 (`2026-01-01T00:00:00Z`).
	 *
	 * @return string
	 */
	public function now(): string;
}
