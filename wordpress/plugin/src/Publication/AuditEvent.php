<?php
/**
 * Safe publication audit event.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;

/** Carries identifiers and UTC time only; no document content. */
final class AuditEvent {
	/**
	 * Create the event.
	 *
	 * @param int     $actor WordPress user ID.
	 * @param int     $post Post ID.
	 * @param ?string $locale Locale.
	 * @param string  $kind Publish or rollback.
	 * @param ?int    $layout_snapshot New layout snapshot.
	 * @param ?int    $content_snapshot New content snapshot.
	 * @param int     $pointer_revision New pointer revision.
	 * @param ?int    $time Unix timestamp, injectable for tests.
	 * @throws \InvalidArgumentException When the kind is invalid.
	 */
	public function __construct(
		private readonly int $actor,
		private readonly int $post,
		private readonly ?string $locale,
		private readonly string $kind,
		private readonly ?int $layout_snapshot,
		private readonly ?int $content_snapshot,
		private readonly int $pointer_revision,
		private readonly ?int $time = null
	) {
		if ( ! \in_array( $kind, [ 'publish', 'rollback', 'page-settings' ], true ) ) {
			throw new \InvalidArgumentException( 'Invalid audit event kind.' );
		}
	}

	/** Return a content-free hook payload.
	 *
	 * @return array{actor:int,post:int,locale:?string,kind:string,layoutSnapshot:?int,contentSnapshot:?int,pointerRevision:int,time:string}
	 */
	public function data(): array {
		return [
			'actor'           => $this->actor,
			'post'            => $this->post,
			'locale'          => $this->locale,
			'kind'            => $this->kind,
			'layoutSnapshot'  => $this->layout_snapshot,
			'contentSnapshot' => $this->content_snapshot,
			'pointerRevision' => $this->pointer_revision,
			'time'            => \gmdate( 'Y-m-d\TH:i:s\Z', $this->time ?? \time() ),
		];
	}
}
