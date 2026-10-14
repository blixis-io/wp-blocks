<?php
/** Attachment lookup seam.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

\defined( 'ABSPATH' ) || exit;

/** Returns URL and intrinsic dimensions for a positive attachment ID. */
interface MediaResolver {
	/**
	 * Apply the documented contract.
	 *
	 * @param int $attachment_id Attachment id.
	 * @return array{url:string,width:int,height:int,alt:string,srcset?:string,sizes?:string}|null Resolved media.
	 */
	public function resolve( int $attachment_id ): ?array;
}
