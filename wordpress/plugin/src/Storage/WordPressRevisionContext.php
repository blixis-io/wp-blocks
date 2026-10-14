<?php
/**
 * WordPress implementation of the revision context.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Current user and UTC time. */
final class WordPressRevisionContext implements RevisionContext {
	/**
	 * The acting user.
	 *
	 * @return int
	 */
	public function user_id(): int {
		return \get_current_user_id();
	}

	/**
	 * The current UTC time.
	 *
	 * @return string
	 */
	public function now(): string {
		return \gmdate( 'Y-m-d\TH:i:s\Z' );
	}
}
