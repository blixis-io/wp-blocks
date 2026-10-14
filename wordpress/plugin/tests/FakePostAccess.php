<?php
/**
 * Mutable document access fake.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

/** Mutable fake for the WordPress access boundary. */
final class FakePostAccess implements PostAccess {
	/** Authentication state.
	 *
	 * @var bool
	 */
	public bool $authenticated = true;
	/** Post exists.
	 *
	 * @var bool
	 */
	public bool $exists = true;
	/** Post type opted in.
	 *
	 * @var bool
	 */
	public bool $opted_in = true;
	/** Edit capability.
	 *
	 * @var bool
	 */
	public bool $can_edit = true;

	/**
	 * Whether publishing is allowed.
	 *
	 * @var bool
	 */
	public bool $can_publish = true;

	/** Implement the access contract. */
	public function is_authenticated(): bool {
		return $this->authenticated;
	}

	/** Implement the access contract.
	 *
	 * @param int $post_id Post ID.
	 */
	public function exists( int $post_id ): bool {
		return $this->exists;
	}

	/** Implement the access contract.
	 *
	 * @param int $post_id Post ID.
	 */
	public function is_opted_in( int $post_id ): bool {
		return $this->opted_in;
	}

	/** Implement the access contract.
	 *
	 * @param int $post_id Post ID.
	 */
	public function can_edit( int $post_id ): bool {
		return $this->can_edit;
	}

	/**
	 * Publishing permission.
	 *
	 * @param int $post_id Post ID.
	 */
	public function can_publish( int $post_id ): bool {
		unset( $post_id );
		return $this->can_publish;
	}
}
