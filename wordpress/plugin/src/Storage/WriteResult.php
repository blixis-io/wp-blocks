<?php
/**
 * Revision-write outcome.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Successful write or an explicit revision conflict. */
final class WriteResult {
	/**
	 * Store a revision-write outcome.
	 *
	 * @param bool $success Whether the write succeeded.
	 * @param int  $revision Value.
	 * @param int  $expected_revision Value.
	 */
	private function __construct( public readonly bool $success, public readonly int $revision, public readonly int $expected_revision ) {}

	/**
	 * Successful new revision.
	 *
	 * @param int $revision Value.
	 * @param int $expected_revision Value.
	 */
	public static function success( int $revision, int $expected_revision ): self {
		return new self( true, $revision, $expected_revision );
	}

	/**
	 * Current and expected revisions for a conflict response.
	 *
	 * @param int $current_revision Value.
	 * @param int $expected_revision Value.
	 */
	public static function conflict( int $current_revision, int $expected_revision ): self {
		return new self( false, $current_revision, $expected_revision );
	}
}
