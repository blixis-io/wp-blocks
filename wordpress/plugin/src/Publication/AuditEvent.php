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
	 * @param int                    $actor WordPress user ID.
	 * @param int                    $post Post ID.
	 * @param ?string                $locale Locale.
	 * @param string                 $kind Publish or rollback.
	 * @param ?int                   $layout_snapshot New layout snapshot.
	 * @param ?int                   $content_snapshot New content snapshot.
	 * @param int                    $pointer_revision New pointer revision.
	 * @param ?int                   $time Unix timestamp, injectable for tests.
	 * @param ?string                $template_id Template identifier for font installs.
	 * @param array<array-key,mixed> $family_slugs Installed allowlisted font family slugs.
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
		private readonly ?int $time = null,
		private readonly ?string $template_id = null,
		private readonly array $family_slugs = []
	) {
		if ( ! \in_array( $kind, [ 'publish', 'rollback', 'unpublish', 'page-settings', 'template-font-install', 'template-import' ], true ) ) {
			throw new \InvalidArgumentException( 'Invalid audit event kind.' );
		}
	}

	/** Return a content-free hook payload.
	 *
	 * @return array{actor:int,post:int,locale:?string,kind:string,layoutSnapshot:?int,contentSnapshot:?int,pointerRevision:int,time:string,templateId?:string,familySlugs?:list<string>,assetReferences?:list<string>}
	 */
	public function data(): array {
		$data = [
			'actor'           => $this->actor,
			'post'            => $this->post,
			'locale'          => $this->locale,
			'kind'            => $this->kind,
			'layoutSnapshot'  => $this->layout_snapshot,
			'contentSnapshot' => $this->content_snapshot,
			'pointerRevision' => $this->pointer_revision,
			'time'            => \gmdate( 'Y-m-d\TH:i:s\Z', $this->time ?? \time() ),
		];
		if ( null !== $this->template_id ) {
			$data['templateId'] = $this->template_id;
			$identifiers        = [];
			foreach ( $this->family_slugs as $slug ) {
				if ( is_string( $slug ) && preg_match( '/^[a-z0-9_-]{1,96}$/D', $slug ) ) {
					$identifiers[] = $slug;
				}
			}
			if ( 'template-import' === $this->kind ) {
				$data['assetReferences'] = $identifiers;
			} else {
				$families = [];
				foreach ( $identifiers as $identifier ) {
					if ( preg_match( '/^[a-z0-9-]{1,64}$/D', $identifier ) ) {
						$families[] = $identifier;
					}
				}
				$data['familySlugs'] = $families;
			}
		}
		return $data;
	}
}
