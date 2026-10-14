<?php
/**
 * Post authorization boundary for document requests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

\defined( 'ABSPATH' ) || exit;

/** Keeps WordPress authorization out of the request policy. */
interface PostAccess {
	/** Whether the current request has an authenticated user. */
	public function is_authenticated(): bool;

	/** Whether the post exists.
	 *
	 * @param int $post_id Post ID.
	 */
	public function exists( int $post_id ): bool;

	/** Whether the post type is opted into Builder.
	 *
	 * @param int $post_id Post ID.
	 */
	public function is_opted_in( int $post_id ): bool;

	/** Whether the current user can edit this post.
	 *
	 * @param int $post_id Post ID.
	 */
	public function can_edit( int $post_id ): bool;
}
